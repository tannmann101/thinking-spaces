import { db } from '../index.js';
import { TEST_SPACE_ID } from './constants.js';

// --- Search ---------------------------------------------------------------
// Finding a thing you wrote, wherever you wrote it. Until now the
// Dashboard could only search Space *titles*, so anything written inside
// an entry was unfindable without remembering which Space it was in.
//
// Plain LIKE over the stored JSON, deliberately, not FTS5. FTS5 is
// available in both better-sqlite3 and D1 (both were probed directly
// before choosing), and it is the right answer at a hundred thousand
// entries. At this app's real size it would mean a virtual table, sync
// triggers and a rebuild path -- three things that can silently drift
// out of step with the content they index -- to speed up a query that
// already returns instantly. Boring wins here.
//
// The SQL matches the raw JSON, so a hit can land on a key name or on
// plumbing (an id, a tag) rather than on prose. Rather than teach the
// query about all 21 content shapes -- which would mean editing it every
// time a Tool is added -- the rows come back wide and are then narrowed
// in JS: readableText() below strips the plumbing, and a row whose only
// match was plumbing is dropped before it is ever shown.

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

export function searchEverything(rawQuery) {
  const query = (rawQuery || '').trim();
  if (query.length < 2) return { query, spaces: [], blocks: [], total: 0 };
  const like = `%${query}%`;

  // A Space matches on its own title or on what it's working toward.
  const spaces = db
    .prepare(
      `SELECT id, title, status, goal, tags
         FROM spaces
        WHERE title LIKE ? COLLATE NOCASE
           OR COALESCE(goal, '') LIKE ? COLLATE NOCASE
        ORDER BY title ASC
        LIMIT ?`
    )
    .all(like, like, MAX_RESULTS);

  // An entry matches on anything written in it. The Test Space is left
  // in deliberately -- unlike the cross-Space aggregates, which exclude
  // it as demo noise, someone searching for a phrase wants it found
  // wherever it actually is.
  const blockRows = db
    .prepare(
      `SELECT blocks.id, blocks.space_id, blocks.type, blocks.content, spaces.title AS space_title
         FROM blocks
         JOIN spaces ON spaces.id = blocks.space_id
        WHERE blocks.content LIKE ? COLLATE NOCASE
        ORDER BY spaces.title ASC, blocks.position ASC
        LIMIT ?`
    )
    .all(like, MAX_RESULTS);

  // Filtered before shaping, rather than carrying a throwaway flag on
  // each result: the SQL matched the raw JSON, so a row whose only hit
  // was plumbing is dropped here before it is ever shown.
  const lowered = query.toLowerCase();
  const blocks = blockRows
    .map((row) => ({ row, text: readableText(JSON.parse(row.content)) }))
    .filter(({ text }) => text.toLowerCase().includes(lowered))
    .map(({ row, text }) => ({
      blockId: row.id,
      spaceId: row.space_id,
      spaceTitle: row.space_title,
      type: row.type,
      excerpt: excerpt(text, query),
    }));

  return { query, spaces, blocks, total: spaces.length + blocks.length, testSpaceId: TEST_SPACE_ID };
}
