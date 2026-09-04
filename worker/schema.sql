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
  goal_ids TEXT NOT NULL DEFAULT '[]',   -- JSON array of goal ids. Many-to-many, the same
                                          -- shape spaces.tags uses. Named goal_ids so it
                                          -- can't be mistaken for the legacy `goal` column.
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
  -- Which specialized environment this is, e.g. 'analyst', 'etymology'
  -- -- see frontend/src/registry/workspaceKinds.js, which is where the
  -- kinds themselves are actually defined. Null means an unkinded
  -- Workspace: the plain, general-purpose kind every Workspace was
  -- before kinds existed, and still the result of naming one by hand.
  kind TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_workspaces_space_id ON workspaces(space_id);

-- Projects: a real, named piece of work you decided to take on, that a
-- Milestone or Session belongs to. Personally initiated, which is what
-- distinguishes it from a Goal (below) -- a pursuit you notice you're
-- heading toward rather than one you set out on.
--
-- A Project does *not* belong to a Space. Its member entries live in
-- whatever Spaces they were created in, so a Project's Spaces are
-- simply whichever those turn out to be -- derived at read time, never
-- stored, which is what lets one Project span several Spaces with
-- nothing extra to keep in sync. A block points at at most one Project
-- (a single nullable `projectId` in its own `properties`, not an
-- array), since a checkpoint or a timed sitting most naturally serves
-- one project -- see updateBlockProject in queries.js.
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  -- The Goal this Project serves, if any. Single and nullable, matching
  -- how a Milestone belongs to at most one Project.
  goal_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

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

-- Trash: what a delete removed, kept so it can be put back.
--
-- Deliberately a snapshot table rather than a `deleted_at` column on
-- every table. A soft-delete column would mean every read query in the
-- app filtering it forever, and one missed filter means deleted content
-- quietly reappearing. This way the delete paths are the only code that
-- changes, and no existing read is touched at all.
--
-- `payload` holds the removed rows exactly as they were, keyed by table
-- name -- so restoring a Space puts its blocks, Workspaces, Projects and
-- Trail entries back too, not just the spaces row.
CREATE TABLE IF NOT EXISTS trash (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,           -- 'space' | 'block' | 'workspace' | 'project' | 'template' | 'resource_template'
  label TEXT NOT NULL,          -- what it was called, for the Trash list
  context TEXT,                 -- where it lived, e.g. its Space's title
  payload TEXT NOT NULL,        -- JSON: { tableName: [rows...] }
  deleted_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_trash_deleted_at ON trash(deleted_at);

-- Goals: a pursuit several Spaces can be working toward at once.
--
-- Distinct from a Project by intent, in the person's own framing:
-- "projects are personally initiated, goals are revealed as relevant
-- pursuits." So a Goal has no Milestones or Sessions of its own -- it's
-- a direction you notice you're heading, not work you scheduled. A
-- Project can name the Goal it serves (projects.goal_id), which is what
-- lets you see whether initiated work is actually feeding a revealed
-- pursuit.
--
-- Replaces the single free-text spaces.goal line, which could only ever
-- hold one thing.
CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
