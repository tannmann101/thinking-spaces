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

-- Resource Templates: a deliberately separate mechanism from the
-- ordinary Templates table above, per direct confirmation. Where a
-- Space Template seeds a block_arrangement wholesale, a Resource
-- Template instead REPLACES CreateResource.jsx's three generic
-- descriptive facets (What It Is / What It Affords / What It Offers)
-- with a type-tailored set of its own -- `facets` is a JSON array of
-- {name, prompt}, one guided question per facet, mirroring the
-- structure of the generic flow it replaces. The fourth, structural
-- facet (Touches / Touched By -- the cross-Space reference picker)
-- stays universal across every type: it's a mechanical capability
-- (create a Reference block to an existing Space), not a descriptive
-- facet that varies by what kind of thing a Resource is, so it's never
-- part of a Template's own `facets` list.
CREATE TABLE IF NOT EXISTS resource_templates (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL UNIQUE, -- matches a Resource's own type tag, e.g. 'book'
  label TEXT NOT NULL, -- display name, e.g. "Book"
  facets TEXT NOT NULL DEFAULT '[]', -- JSON array of {name, prompt}
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS spaces (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  template_id TEXT REFERENCES templates(id),
  status TEXT NOT NULL DEFAULT 'active',
  tags TEXT NOT NULL DEFAULT '[]', -- JSON array of strings, e.g. ["resource"]
  goal TEXT,                       -- what this Space is working towards; separate from its content
  categories TEXT NOT NULL DEFAULT '[]', -- JSON array of freely-named facets specific to this Space's
                                          -- own topic (e.g. ["Financial Impact", "Risk Tolerance"]) --
                                          -- distinct from tags, which categorize the Space itself
                                          -- (e.g. "resource") among every other Space
  accent TEXT,                     -- SUPERSEDED, retained only so existing rows keep loading. This was
                                    -- Visual Identity's manual accent layer (a 'star'/'underline'/
                                    -- 'triangle'/'dot' mark on the glyph). It was replaced by `theme`
                                    -- below, which does the same job properly -- see the theming
                                    -- Roadmap entry in CLAUDE.md. Nothing reads or writes it anymore.
  theme TEXT,                      -- JSON {accent, shape, density, typeface} | null. The manual half
                                    -- of personalization: every Space already gets a distinct look
                                    -- computed from what it is (an ordinary Space vs. a Resource vs.
                                    -- a Synthesis), and this overrides any subset of that by hand.
                                    -- Null means "use the computed default for this kind of Space" --
                                    -- see frontend/src/theme/itemTheme.js for the option lists and
                                    -- the merge. A block's own override lives in properties.theme.
  goal_ids TEXT NOT NULL DEFAULT '[]',
                                    -- JSON array of goal ids. The app's established many-to-many
                                    -- shape (see spaces.tags, properties.workspaces), queried with
                                    -- json_each. Named goal_ids, not goals, so it can't be mistaken
                                    -- for the legacy single free-text `goal` column above.
  origin TEXT,                     -- 'external' | 'internal' | null. Distinguishes a Space brought in
                                    -- from outside the app (a Resource) from one the app itself
                                    -- produced (a Synthesis, or anything later promoted to Resource
                                    -- status) -- see the Resources/Synthesis vocabulary entries.
                                    -- Null is an ordinary train-of-thought Space: neither.
  due_date TEXT,                   -- 'YYYY-MM-DD' | null. A real target date for the Space as a
                                    -- whole -- distinct from a List item's own `reviewBy` (which
                                    -- means "come back and reconsider this," not "this is due").
                                    -- Null means no due date set; that's the default.
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
-- block_id is set only for a 'block_added' event and only while that
-- block still exists -- a 'block_removed' event leaves it null, since
-- there's nothing left to link to (see Dashboard/Log/Insights
-- deep-linking, which reads this column to jump straight to the block
-- a digest is actually about instead of just the Space it lives on).
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
