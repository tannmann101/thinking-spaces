-- Thinking Spaces database schema.
-- This is the starting data model from CLAUDE.md, Pass 1: just the three
-- tables needed to create and list Spaces. No Views/Blocks logic reads
-- from this yet -- that comes in later passes.

CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  block_arrangement TEXT NOT NULL DEFAULT '[]', -- JSON array
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS spaces (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  template_id TEXT REFERENCES templates(id),
  status TEXT NOT NULL DEFAULT 'nascent',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS blocks (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  type TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '{}',    -- JSON
  properties TEXT NOT NULL DEFAULT '{}', -- JSON
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Reference blocks store their target Space in content as JSON
-- (e.g. {"target_space_id": "..."}). This index is called out in
-- CLAUDE.md because backlinks and the future Graph view will query
-- it constantly once Reference blocks exist.
CREATE INDEX IF NOT EXISTS idx_blocks_space_id ON blocks(space_id);
CREATE INDEX IF NOT EXISTS idx_blocks_reference_target
  ON blocks(json_extract(content, '$.target_space_id'))
  WHERE type = 'reference';

-- Trail: the history layer (see Tools & Resources doc). "auto" entries
-- are written automatically on a Skeleton structural change (an item
-- promoted into a lane, the Current Best Articulation edited); "manual"
-- entries are a narrative "why" the person adds directly. Every entry
-- carries a full snapshot of the Skeleton's state at that moment, since
-- that's what Rewind reconstructs from -- simpler than diffing, and
-- this app's data volumes don't make the extra storage a real cost.
CREATE TABLE IF NOT EXISTS trail_entries (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  kind TEXT NOT NULL, -- 'auto' | 'manual'
  summary TEXT NOT NULL,
  note TEXT,
  skeleton_snapshot TEXT NOT NULL, -- JSON
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_trail_entries_space_id ON trail_entries(space_id);
