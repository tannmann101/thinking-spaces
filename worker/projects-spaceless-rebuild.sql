-- One-time rebuild of the projects table: a Project no longer belongs
-- to a Space.
--
-- This is a rebuild rather than an ALTER because SQLite cannot drop a
-- column that carries a foreign key, and the old `projects.space_id`
-- was NOT NULL with a foreign key into spaces(id) -- which blocks
-- inserting a standalone Project at all, so it could not simply be left
-- in place and ignored the way `spaces.accent` was.
--
-- The Node backend does this automatically at boot
-- (migrateProjectsSpaceless() in backend/src/db/queries/projects.js);
-- a Worker has no boot hook, so it runs by hand here once.
--
-- NOT idempotent: run it only if `PRAGMA table_info(projects);` still
-- shows a space_id column. See DEPLOY.md's checklist.
--
-- Order matters: the `ALTER TABLE projects ADD COLUMN goal_id TEXT;`
-- from the checklist has to run BEFORE this, since the SELECT below
-- reads that column.
--
-- Apply with:
--   npx wrangler d1 execute thinking-spaces --remote --file=projects-spaceless-rebuild.sql

CREATE TABLE projects_rebuilt (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  goal_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO projects_rebuilt (id, name, goal_id, created_at, updated_at)
  SELECT id, name, goal_id, created_at, updated_at FROM projects;

DROP TABLE projects;

ALTER TABLE projects_rebuilt RENAME TO projects;
