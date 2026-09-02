-- Thinking Spaces database schema, D1 edition.
--
-- This is the *current, final* shape of every table -- unlike
-- backend/src/db/schema.sql (which only has the Pass 1 columns, with
-- the rest added by ensureColumn's runtime ALTER TABLEs in
-- backend/src/db/index.js), a D1 database starts fresh, so there's no
-- migration history to replay: every column the app currently uses is
-- just declared directly. See CLAUDE.md's "Data model, current state"
-- section for what each column means.
--
-- Apply with: wrangler d1 execute thinking-spaces --remote --file=schema.sql

CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  block_arrangement TEXT NOT NULL DEFAULT '[]', -- JSON array
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS resource_templates (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  facets TEXT NOT NULL DEFAULT '[]', -- JSON array of {name, prompt}
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS spaces (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  template_id TEXT REFERENCES templates(id),
  status TEXT NOT NULL DEFAULT 'active',
  tags TEXT NOT NULL DEFAULT '[]',       -- JSON array of strings, e.g. ["resource"]
  goal TEXT,                             -- what this Space is working towards
  categories TEXT NOT NULL DEFAULT '[]', -- JSON array of freely-named facets of this
                                          -- Space's own topic -- distinct from tags
  accent TEXT,                           -- SUPERSEDED by `theme` below; nothing reads it
                                          -- anymore. Kept so existing rows keep loading.
  theme TEXT,                            -- JSON {accent, shape, density, typeface} | null --
                                          -- the manual half of personalization, overriding
                                          -- the look this kind of Space computes for itself.
                                          -- See frontend/src/theme/itemTheme.js.
  origin TEXT,                           -- 'external' | 'internal' | null -- Provenance
  due_date TEXT,                         -- 'YYYY-MM-DD' | null -- a real target date
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

CREATE INDEX IF NOT EXISTS idx_blocks_space_id ON blocks(space_id);
CREATE INDEX IF NOT EXISTS idx_blocks_reference_target
  ON blocks(json_extract(content, '$.target_space_id'))
  WHERE type = 'reference';

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_workspaces_space_id ON workspaces(space_id);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_projects_space_id ON projects(space_id);

CREATE TABLE IF NOT EXISTS trail_entries (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  kind TEXT NOT NULL, -- 'auto' | 'manual' | 'review'
  summary TEXT NOT NULL,
  note TEXT,
  skeleton_snapshot TEXT NOT NULL, -- JSON
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_trail_entries_space_id ON trail_entries(space_id);

-- block_id is set only for a 'block_added' event and only while that
-- block still exists -- a 'block_removed' event leaves it null, since
-- there's nothing left to link to. Added after the initial deploy: see
-- DEPLOY.md's "Making schema changes later" for the one-time
-- `ALTER TABLE activity_log ADD COLUMN block_id TEXT;` this needs
-- against the real, already-deployed database.
CREATE TABLE IF NOT EXISTS activity_log (
  id TEXT PRIMARY KEY,
  space_id TEXT,
  space_title TEXT,
  block_id TEXT,
  kind TEXT NOT NULL,
  summary TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at);
