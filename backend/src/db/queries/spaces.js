import { randomUUID } from 'node:crypto';
import { db } from '../index.js';
import { TEST_SPACE_ID, todayString } from './constants.js';
import { logActivity } from './activityLog.js';
import { recordTrash } from './trash.js';
import { applyTemplate } from './templates.js';
import { createWorkspace } from './workspaces.js';
import { addBlockToSpace } from './blocks.js';

// Visual Identity's two computed dimensions besides status (see the
// Tools & Resources doc). Both are plain per-space queries rather than
// a batched aggregate -- this app's tables are small enough (one
// person's Spaces) that an extra indexed query per Space in a list
// isn't worth the complexity of pre-aggregating.
function getRelationDensity(spaceId) {
  const outgoing = db
    .prepare(`SELECT COUNT(*) AS count FROM blocks WHERE space_id = ? AND type = 'reference'`)
    .get(spaceId).count;
  const incoming = db
    .prepare(
      `SELECT COUNT(*) AS count FROM blocks
       WHERE type = 'reference' AND json_extract(content, '$.target_space_id') = ?`
    )
    .get(spaceId).count;
  return outgoing + incoming;
}

// No "resolved" state exists yet for a Tension (that's Tension
// Resolver territory, not built) -- so every item in the Tensions lane
// currently counts as open.
function getOpenTensionCount(spaceId) {
  const row = db
    .prepare(
      `SELECT json_array_length(content, '$.items') AS count
       FROM blocks
       WHERE space_id = ? AND type = 'list' AND json_extract(properties, '$.skeletonLane') = 'tensions'`
    )
    .get(spaceId);
  return row ? row.count : 0;
}

// {reached, total} across every Milestone block in the Space -- feeds
// SpaceGlyph's own reactivity (a row of filled/hollow dots) the same
// way getRelationDensity/getOpenTensionCount already feed its branches
// and crack. json_extract reads a JSON boolean back as SQLite's native
// 1/0, so SUM directly counts how many are reached without pulling
// every row into JS first.
function getMilestoneStats(spaceId) {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS total, COALESCE(SUM(json_extract(content, '$.reached')), 0) AS reached
       FROM blocks WHERE space_id = ? AND type = 'milestone'`
    )
    .get(spaceId);
  return { reached: row.reached, total: row.total };
}

// `accent` is deliberately absent -- it's superseded by `theme` and
// nothing reads it anymore (see schema.sql's own note on the column).
const SPACE_COLUMNS =
  'id, title, status, template_id, tags, goal, categories, theme, origin, due_date, created_at, updated_at';

function withComputedSpaceFields(space) {
  if (!space) return space;
  return {
    ...space,
    tags: JSON.parse(space.tags ?? '[]'),
    categories: JSON.parse(space.categories ?? '[]'),
    // The manual half of this Space's look, or null for "use whatever
    // the computed default for this kind of Space is" -- resolved on
    // the frontend (see theme/itemTheme.js), never here, since the
    // defaults are a rendering concern rather than stored data.
    theme: space.theme ? JSON.parse(space.theme) : null,
    isTestSpace: space.id === TEST_SPACE_ID,
    relationDensity: getRelationDensity(space.id),
    openTensionCount: getOpenTensionCount(space.id),
    // A Space is overdue purely by its own due_date having passed --
    // independent of status, same reasoning staleness (Insights) is
    // independent of status: a Space can sit at "active" forever
    // without anyone touching it, and a due date can pass the same way.
    isOverdue: Boolean(space.due_date && space.due_date < todayString()),
    milestoneStats: getMilestoneStats(space.id),
  };
}

export function listSpaces() {
  const rows = db
    .prepare(`SELECT ${SPACE_COLUMNS} FROM spaces ORDER BY updated_at DESC`)
    .all();
  return rows.map(withComputedSpaceFields);
}

// Reusable for "Resources" (tag: 'resource') and any future category --
// tags are a plain JSON array on the Space, queried by membership here
// rather than filtered ad hoc wherever a tag happens to be needed. The
// Test Space is excluded, same reasoning as every other cross-Space
// listing: it's scratch content, not a real Resource/category member.
export function listSpacesByTag(tag) {
  const rows = db
    .prepare(
      `SELECT ${SPACE_COLUMNS} FROM spaces
       WHERE id != ? AND EXISTS (
         SELECT 1 FROM json_each(spaces.tags) WHERE json_each.value = ?
       )
       ORDER BY updated_at DESC`
    )
    .all(TEST_SPACE_ID, tag);
  return rows.map(withComputedSpaceFields);
}

export function getSpaceById(id) {
  const row = db.prepare(`SELECT ${SPACE_COLUMNS} FROM spaces WHERE id = ?`).get(id);
  return withComputedSpaceFields(row);
}

// id is optional: pass one for a fixed, well-known Space (the Test
// Space, and the other seeded demo Spaces in seedTestSpace.js). tags is
// only really used by seed data (e.g. tagging the Resource demo Space
// at creation) -- an ordinary new Space starts untagged and gets tagged
// later through the same PATCH /spaces/:id every other edit uses.
// categories can be set at creation too -- unlike tags, a guided
// creation flow (Resource creation is the first to do this) may already
// know exactly which facets this Space's content should be filed under
// before any block exists yet. origin is the same idea for provenance:
// CreateResource.jsx passes 'external', CreateSynthesis.jsx passes
// 'internal', and an ordinary Space leaves it null (see the Resources/
// Synthesis vocabulary entries in CLAUDE.md).
export function createSpace({
  id = randomUUID(),
  title,
  templateId = null,
  status = 'active',
  tags = [],
  categories = [],
  origin = null,
  dueDate = null,
}) {
  db.prepare(
    `INSERT INTO spaces (id, title, template_id, status, tags, categories, origin, due_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, title, templateId, status, JSON.stringify(tags), JSON.stringify(categories), origin, dueDate);
  const summary = `Created "${title}"`;
  logActivity({ spaceId: id, spaceTitle: title, kind: 'space_created', summary });
  return { ...getSpaceById(id), changeSummary: summary };
}

// A Space's title, status, tags, goal, categories, theme, and due
// date are all edited through this one function. Any subset of fields
// can be given; the rest keep their current value, same pattern as
// updateTemplate (templates.js). categories are freely-named facets
// specific to this Space's own topic (e.g. "Financial Impact") that its
// own blocks get filed under -- not to be confused with tags, which
// categorize the Space itself (e.g. "resource") among every other
// Space. theme is the manual half of personalization -- any subset of
// {accent, shape, density, typeface} overriding the look this kind of
// Space would otherwise compute for itself; passing null clears it back
// to that computed default. dueDate is a real target date for the Space
// as a whole, distinct from a List item's own `reviewBy`.
export function updateSpace(id, { title, status, tags, goal, categories, theme, dueDate } = {}) {
  const existing = db.prepare(`SELECT * FROM spaces WHERE id = ?`).get(id);
  if (!existing) return null;

  const next = {
    title: title !== undefined ? title : existing.title,
    status: status !== undefined ? status : existing.status,
    tags: tags !== undefined ? JSON.stringify(tags) : existing.tags,
    goal: goal !== undefined ? goal : existing.goal,
    categories: categories !== undefined ? JSON.stringify(categories) : existing.categories,
    theme: theme !== undefined ? (theme ? JSON.stringify(theme) : null) : existing.theme,
    due_date: dueDate !== undefined ? dueDate : existing.due_date,
  };
  db.prepare(
    `UPDATE spaces SET title = ?, status = ?, tags = ?, goal = ?, categories = ?, theme = ?, due_date = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(next.title, next.status, next.tags, next.goal, next.categories, next.theme, next.due_date, id);
  // Only a status change gets logged, not every title/tag/goal edit --
  // status progression (inactive -> active -> mature) is genuinely
  // trend-worthy; a renamed tag isn't.
  //
  // changeSummary (see changeSummary.js) is a lighter-weight cousin of
  // this: a short sentence attached to the response so the toast (see
  // Toast.jsx) can say what actually happened, not just "Saved" --
  // status and due-date changes are the two edits on a Space with a
  // real implication worth naming (a due date showing up on the Week
  // digest, possibly already overdue). Every other field edit here
  // (title, tags, goal, categories, theme) falls back to the toast's
  // own generic "Saved", which is still an honest, non-misleading thing
  // to say about them.
  let changeSummary = null;
  if (status !== undefined && status !== existing.status) {
    changeSummary = `Status changed to ${next.status}`;
    logActivity({
      spaceId: id,
      spaceTitle: next.title,
      kind: 'space_status_changed',
      summary: `"${next.title}" status changed to ${next.status}`,
    });
  }
  if (dueDate !== undefined && dueDate !== existing.due_date) {
    if (!next.due_date) {
      changeSummary = 'Due date cleared';
    } else {
      const overdue = next.due_date < todayString();
      changeSummary = overdue
        ? `Due ${next.due_date} -- already overdue`
        : `Due ${next.due_date} -- now shows on your Week digest`;
    }
  }
  const result = getSpaceById(id);
  return changeSummary ? { ...result, changeSummary } : result;
}

// You could create a Space but never get rid of one -- the last "add
// with no remove" gap. Blocks, Workspaces, and Trail entries are all
// deleted first since each carries a foreign key to spaces(id) with
// foreign_keys = ON (see db/index.js); there's no ON DELETE CASCADE on
// the schema, so this does it explicitly, in the same spirit as
// everything else in this file being plain and visible rather than
// relying on database magic. The Test Space is protected -- it's a
// fixed scratch area other code assumes exists (ensureTestSpaceExists
// recreates it if missing, but there's no reason to make that path fire
// by accident). A Reference block elsewhere that pointed at the deleted
// Space is left as-is; it just renders its raw target id once the title
// lookup can no longer resolve, the same graceful fallback a bad id
// already gets.
//
// The Workspaces delete was missing for several passes (flagged twice
// in CLAUDE.md's Open section, surfaced while testing Reports and again
// while testing the queries.js split) -- any Space that ever had a
// Workspace couldn't be deleted at all, since the DELETE FROM spaces
// below would fail workspaces' own foreign key first. Caught for real
// and fixed here once a test exercised exactly that case.
export function deleteSpace(id) {
  if (id === TEST_SPACE_ID) {
    throw new Error('The Test Space cannot be deleted');
  }
  const existing = getSpaceById(id);

  // Snapshot everything about to be removed, so this is undoable. Rows
  // are captured in the order they'd need to go back -- the Space first,
  // then everything that references it -- see queries/trash.js.
  if (existing) {
    recordTrash({
      kind: 'space',
      label: existing.title,
      context: null,
      payload: {
        spaces: db.prepare(`SELECT * FROM spaces WHERE id = ?`).all(id),
        blocks: db.prepare(`SELECT * FROM blocks WHERE space_id = ?`).all(id),
        workspaces: db.prepare(`SELECT * FROM workspaces WHERE space_id = ?`).all(id),
        projects: db.prepare(`SELECT * FROM projects WHERE space_id = ?`).all(id),
        trail_entries: db.prepare(`SELECT * FROM trail_entries WHERE space_id = ?`).all(id),
      },
    });
  }

  db.prepare(`DELETE FROM blocks WHERE space_id = ?`).run(id);
  db.prepare(`DELETE FROM workspaces WHERE space_id = ?`).run(id);
  db.prepare(`DELETE FROM projects WHERE space_id = ?`).run(id);
  db.prepare(`DELETE FROM trail_entries WHERE space_id = ?`).run(id);
  db.prepare(`DELETE FROM spaces WHERE id = ?`).run(id);
  // Logged with a snapshotted title (not a live join) precisely because
  // the Space this refers to no longer exists after this point.
  if (existing) {
    logActivity({
      spaceId: null,
      spaceTitle: existing.title,
      kind: 'space_deleted',
      summary: `Deleted "${existing.title}"`,
    });
  }
}

// Creation Mode's whole job is composing a Space from the same pieces
// every other path already uses -- a Template's starting blocks
// (applyTemplate, templates.js), any extra Tools chosen on top of it
// (addBlockToSpace, blocks.js), a Reference block per Resource pulled
// in (addBlockToSpace again, same as createRelationalSpace does for its
// selections), and the Space's own tags/goal/categories
// (createSpace/updateSpace above). Nothing here is new machinery --
// this just does all of it in one request instead of asking the
// frontend to sequence several.
//
// `workspaces` names Workspaces to assemble from the start (Creation
// Mode's own "Workspaces" step). They're created before extraBlocks are
// added specifically so a block can be filed into one immediately: a
// block spec carrying `properties.workspaceNames` (draft-time names --
// real ids don't exist yet when the frontend builds the request) gets
// those names resolved against the freshly-created Workspaces here and
// rewritten into `properties.workspaces` (real ids), the same field
// BlockWorkspacePicker and the Workspace page both already read.
export function createSpaceWithSetup({
  title,
  templateId = null,
  extraBlocks = [],
  resourceSpaceIds = [],
  tags = [],
  categories = [],
  workspaces = [],
  goal = null,
  origin = null,
}) {
  const space = createSpace({ title, templateId, tags, categories, origin });
  if (templateId) {
    applyTemplate(space.id, templateId);
  }
  const workspaceIdByName = new Map(
    workspaces.map((name) => [name, createWorkspace({ spaceId: space.id, name }).id])
  );
  extraBlocks.forEach(({ properties = {}, ...blockSpec }) => {
    const { workspaceNames, ...restProperties } = properties;
    const resolvedWorkspaceIds = (workspaceNames || [])
      .map((name) => workspaceIdByName.get(name))
      .filter(Boolean);
    addBlockToSpace(space.id, {
      ...blockSpec,
      properties:
        resolvedWorkspaceIds.length > 0
          ? { ...restProperties, workspaces: resolvedWorkspaceIds }
          : restProperties,
    });
  });
  resourceSpaceIds.forEach((targetSpaceId) => {
    addBlockToSpace(space.id, {
      type: 'reference',
      content: { target_space_id: targetSpaceId, note: null },
    });
  });
  if (goal) {
    updateSpace(space.id, { goal });
  }
  // Reuses createSpace's own changeSummary rather than recomputing the
  // same "Created ..." sentence a second time -- the starter blocks and
  // Workspaces added above are setup detail, not what the toast (see
  // Toast.jsx) should lead with.
  return { ...getSpaceById(space.id), changeSummary: space.changeSummary };
}

// One-time data migration for the status vocabulary change. The
// original four values were the app's own invention (nascent /
// developing / mature / dormant); the five below are the person's own
// words for how they actually think about a Space's state, which is
// what the vocabulary is supposed to follow. Both of the old values
// meaning "this is being worked on" collapse into `active` -- a
// distinction between "just started" and "under way" wasn't one being
// used in practice, and `interesting` (genuinely new) has no old value
// to migrate from, so nothing maps onto it.
//
// Idempotent by construction: it only ever rewrites the two retired
// values, so a second run finds nothing left to do. Runs at startup
// alongside the other one-time migrations (see backend/src/index.js).
const RETIRED_STATUS_MAP = {
  nascent: 'active',
  developing: 'active',
};

export function migrateSpaceStatuses() {
  const statement = db.prepare(`UPDATE spaces SET status = ? WHERE status = ?`);
  Object.entries(RETIRED_STATUS_MAP).forEach(([oldStatus, newStatus]) => {
    statement.run(newStatus, oldStatus);
  });
}

// Idempotent: creates the Test Space the first time the app runs, does
// nothing on every run after that. Called once at startup.
export function ensureTestSpaceExists() {
  const existing = getSpaceById(TEST_SPACE_ID);
  if (existing) return existing;
  return createSpace({ id: TEST_SPACE_ID, title: 'Test Space', status: 'active' });
}

// A "Relational Space" isn't a distinct schema -- CLAUDE.md is explicit
// that it's just an ordinary Space whose content happens to reference
// two or more other Spaces. This composes the same createSpace/
// addBlockToSpace every other Space creation path uses: one Reference
// block per selected Space, plus one blank Text block for your own
// writing about the connection, seeded once at creation like any
// Template would be. Lives here (moved from its original spot in the
// old single-file queries.js, physically grouped with the Blocks
// section) rather than in blocks.js, since creating a Relational Space
// is conceptually a Space-creation function, same family as
// createSpaceWithSetup above.
//
// Tagged 'relational' at creation, the same way a Resource gets tagged
// 'resource' and a Synthesis gets tagged 'synthesis' -- surfaced from
// the category-hygiene audit that a Relational Space had no persistent
// signal at all once created (no origin, no tag), so it read as
// completely indistinguishable from a Space built by hand the moment
// you left the Graph page. The tag is an ordinary tag, not a protected
// flag: it shows up as a chip wherever tags already render (the
// Dashboard's Space list, the Space page's own TagEditor) and can be
// removed like any other tag, same as everything else in this app.
export function createRelationalSpace({ title, spaceIds }) {
  const space = createSpace({ title, tags: ['relational'] });
  addBlockToSpace(space.id, { type: 'text', content: { tag: null, text: '' } });
  spaceIds.forEach((targetSpaceId) => {
    addBlockToSpace(space.id, {
      type: 'reference',
      content: { target_space_id: targetSpaceId, note: null },
    });
  });
  return { ...getSpaceById(space.id), changeSummary: space.changeSummary };
}
