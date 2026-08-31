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
  tags TEXT NOT NULL DEFAULT '[]', -- JSON array of strings, e.g. ["resource"]
  goal TEXT,                       -- what this Space is working towards; separate from its content
  categories TEXT NOT NULL DEFAULT '[]', -- JSON array of freely-named facets specific to this Space's
                                          -- own topic (e.g. ["Financial Impact", "Risk Tolerance"]) --
                                          -- distinct from tags, which categorize the Space itself
                                          -- (e.g. "resource") among every other Space
  accent TEXT,                     -- Visual Identity's manual accent layer: one of a small fixed set
                                    -- ('star'/'underline'/'triangle'/'dot'), hand-picked on the Space
                                    -- page and drawn on top of SpaceGlyph's computed base -- never
                                    -- replacing it. Null means no accent picked; that's the default.
  origin TEXT,                     -- 'external' | 'internal' | null. Distinguishes a Space brought in
                                    -- from outside the app (a Resource) from one the app itself
                                    -- produced (a Synthesis, or anything later promoted to Resource
                                    -- status) -- see the Resources/Synthesis vocabulary entries.
                                    -- Null is an ordinary train-of-thought Space: neither.
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

-- Workspaces: a deliberately assembled, named environment inside one
-- Space that bundles several Tools together for focused engagement --
-- distinct from a Category (a facet of the topic; free-standing string,
-- no page of its own) and distinct from a plain block (a single Tool).
-- A block joins a Workspace via `workspaces` (a JSON array of workspace
-- ids) in its own `properties`, the same many-to-many shape Categories
-- already use -- see updateBlockWorkspaces in queries.js.
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_workspaces_space_id ON workspaces(space_id);

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

-- The Log: a global, cross-Space activity feed -- every structural
-- lifecycle event (Spaces/Tools/Templates created, removed, or
-- changing status), not the finer-grained Skeleton history Trail
-- already covers (the Log page merges both). space_id deliberately
-- has no foreign key and space_title is snapshotted at write time,
-- since a "Space deleted" entry needs to survive the Space itself
-- being gone -- joining against spaces for a title wouldn't work once
-- the row is gone. space_id/space_title are both null for events not
-- tied to a Space (Template changes).
CREATE TABLE IF NOT EXISTS activity_log (
  id TEXT PRIMARY KEY,
  space_id TEXT,
  space_title TEXT,
  kind TEXT NOT NULL,
  summary TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at);
