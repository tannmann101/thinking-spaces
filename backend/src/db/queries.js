// The single set of query functions every route is expected to go
// through, per CLAUDE.md: "Keep all cross-Space queries ... going
// through a small, consistent set of query functions rather than ad hoc
// SQL sprinkled around." Route handlers should never write raw SQL --
// if a route needs a new query, it gets added here, not inline.

import { randomUUID } from 'node:crypto';
import { db } from './index.js';

// The one Space that always exists as Pass 2's scratch area. A fixed,
// well-known ID (rather than a new "is_test" column) keeps the schema
// exactly as CLAUDE.md specified it -- this is the one place that ID
// is defined, and everything else asks "does this id match?" through
// the isTestSpace flag added below, rather than hardcoding it elsewhere.
export const TEST_SPACE_ID = 'test-space';

function withTestSpaceFlag(space) {
  if (!space) return space;
  return { ...space, isTestSpace: space.id === TEST_SPACE_ID };
}

export function listSpaces() {
  const rows = db
    .prepare(
      `SELECT id, title, status, template_id, created_at, updated_at
       FROM spaces
       ORDER BY updated_at DESC`
    )
    .all();
  return rows.map(withTestSpaceFlag);
}

export function getSpaceById(id) {
  const row = db
    .prepare(
      `SELECT id, title, status, template_id, created_at, updated_at
       FROM spaces
       WHERE id = ?`
    )
    .get(id);
  return withTestSpaceFlag(row);
}

export function createSpace({ title, templateId = null, status = 'nascent' }) {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO spaces (id, title, template_id, status)
     VALUES (?, ?, ?, ?)`
  ).run(id, title, templateId, status);
  return getSpaceById(id);
}

export function listTemplates() {
  return db
    .prepare(
      `SELECT id, name, block_arrangement, created_at, updated_at
       FROM templates
       ORDER BY name ASC`
    )
    .all();
}

// Idempotent: creates the Test Space the first time the app runs, does
// nothing on every run after that. Called once at startup.
export function ensureTestSpaceExists() {
  const existing = getSpaceById(TEST_SPACE_ID);
  if (existing) return existing;

  db.prepare(
    `INSERT INTO spaces (id, title, status)
     VALUES (?, ?, ?)`
  ).run(TEST_SPACE_ID, 'Test Space', 'developing');
  return getSpaceById(TEST_SPACE_ID);
}

function parseBlockRow(row) {
  if (!row) return row;
  return {
    ...row,
    content: JSON.parse(row.content),
    properties: JSON.parse(row.properties),
  };
}

export function listBlocksForSpace(spaceId) {
  const rows = db
    .prepare(
      `SELECT id, space_id, type, content, properties, position, created_at, updated_at
       FROM blocks
       WHERE space_id = ?
       ORDER BY position ASC, created_at ASC`
    )
    .all(spaceId);
  return rows.map(parseBlockRow);
}

export function getBlockById(id) {
  const row = db
    .prepare(
      `SELECT id, space_id, type, content, properties, position, created_at, updated_at
       FROM blocks
       WHERE id = ?`
    )
    .get(id);
  return parseBlockRow(row);
}

// type is optional: pass it to count only blocks of that type, which is
// what lets the Test Space seed each Block type independently as it's
// built, without re-seeding types that already have demo content.
export function countBlocksForSpace(spaceId, type = null) {
  const row = type
    ? db.prepare(`SELECT COUNT(*) AS count FROM blocks WHERE space_id = ? AND type = ?`).get(spaceId, type)
    : db.prepare(`SELECT COUNT(*) AS count FROM blocks WHERE space_id = ?`).get(spaceId);
  return row.count;
}

export function createBlock({ spaceId, type, content = {}, properties = {}, position = 0 }) {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO blocks (id, space_id, type, content, properties, position)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, spaceId, type, JSON.stringify(content), JSON.stringify(properties), position);
  return getBlockById(id);
}
