// Ported from backend/src/db/queries/search.js -- see that file for why
// this is a plain LIKE rather than FTS5.

import { TEST_SPACE_ID } from './constants.js';

const MAX_RESULTS = 100;

function excerpt(text, term, radius = 60) {
  if (!text) return '';
  const at = text.toLowerCase().indexOf(term.toLowerCase());
  if (at === -1) return text.slice(0, radius * 2);
  const start = Math.max(0, at - radius);
  const end = Math.min(text.length, at + term.length + radius);
  return `${start > 0 ? '...' : ''}${text.slice(start, end)}${end < text.length ? '...' : ''}`;
}

// Plumbing fields -- ids, pointers and fixed enum values. Their contents
// are real strings but they are never prose, so an excerpt built from
// them reads as gibberish ("466920ad-... The map is not the territory.
// quote"). Skipped by key name rather than by guessing at the value,
// with a UUID check as a backstop for anything not listed.
const PLUMBING_KEYS = new Set([
  'id',
  'tag',
  'kind',
  'type',
  'from',
  'to',
  'alignment',
  'confidence',
  'mediaType',
  'target_space_id',
  'spaceId',
  'blockId',
  'itemId',
  'projectId',
]);

const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Pulls the readable words out of a block's content, so the excerpt
// shown to the person is prose rather than a slice of raw JSON. Walks
// the content generically rather than switching on type -- which is what
// keeps this working for a Tool type added after this was written.
function readableText(content) {
  const parts = [];
  const walk = (value) => {
    if (typeof value === 'string') {
      if (!UUID_LIKE.test(value)) parts.push(value);
    } else if (Array.isArray(value)) {
      value.forEach(walk);
    } else if (value && typeof value === 'object') {
      Object.entries(value).forEach(([key, child]) => {
        if (!PLUMBING_KEYS.has(key)) walk(child);
      });
    }
  };
  walk(content);
  return parts.join(' ');
}

export async function searchEverything(env, rawQuery) {
  const query = (rawQuery || '').trim();
  if (query.length < 2) return { query, spaces: [], blocks: [], total: 0 };
  const like = `%${query}%`;

  const spacesResult = await env.DB.prepare(
    `SELECT id, title, status, goal, tags
       FROM spaces
      WHERE title LIKE ? COLLATE NOCASE
         OR COALESCE(goal, '') LIKE ? COLLATE NOCASE
      ORDER BY title ASC
      LIMIT ?`
  )
    .bind(like, like, MAX_RESULTS)
    .all();

  const blockResult = await env.DB.prepare(
    `SELECT blocks.id, blocks.space_id, blocks.type, blocks.content, spaces.title AS space_title
       FROM blocks
       JOIN spaces ON spaces.id = blocks.space_id
      WHERE blocks.content LIKE ? COLLATE NOCASE
      ORDER BY spaces.title ASC, blocks.position ASC
      LIMIT ?`
  )
    .bind(like, MAX_RESULTS)
    .all();

  // Filtered before shaping, rather than carrying a throwaway flag on
  // each result: the SQL matched the raw JSON, so a row whose only hit
  // was plumbing is dropped here before it is ever shown.
  const lowered = query.toLowerCase();
  const blocks = blockResult.results
    .map((row) => ({ row, text: readableText(JSON.parse(row.content)) }))
    .filter(({ text }) => text.toLowerCase().includes(lowered))
    .map(({ row, text }) => ({
      blockId: row.id,
      spaceId: row.space_id,
      spaceTitle: row.space_title,
      type: row.type,
      excerpt: excerpt(text, query),
    }));

  return {
    query,
    spaces: spacesResult.results,
    blocks,
    total: spacesResult.results.length + blocks.length,
    testSpaceId: TEST_SPACE_ID,
  };
}
