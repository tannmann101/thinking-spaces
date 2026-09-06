// --- Spaces ------------------------------------------------------------
// A Space is one train of thought. This module owns creating them,
// reading them back with their computed fields attached (the three
// dimensions SpaceGlyph draws from, plus isOverdue and milestoneStats),
// editing them, and deleting them into the trash along with everything
// that lived inside.
//
// The computed fields are plain per-Space queries rather than one
// batched aggregate: this app's tables are small enough (one person's
// Spaces) that an extra indexed query per Space in a list isn't worth
// the complexity of pre-aggregating.

import { TEST_SPACE_ID, INBOX_SPACE_ID, todayString } from './constants.js';
import { logActivity } from './activityLog.js';
import { applyTemplate } from './templates.js';
import { createWorkspace } from './workspaces.js';
import { addBlockToSpace } from './blocks.js';
import { recordTrash } from './trash.js';

async function getRelationDensity(env, spaceId) {
  const outgoing = await env.DB.prepare(`SELECT COUNT(*) AS count FROM blocks WHERE space_id = ? AND type = 'reference'`)
    .bind(spaceId)
    .first();
  const incoming = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM blocks
     WHERE type = 'reference' AND json_extract(content, '$.target_space_id') = ?`
  )
    .bind(spaceId)
    .first();
  return outgoing.count + incoming.count;
}

async function getOpenTensionCount(env, spaceId) {
  const row = await env.DB.prepare(
    `SELECT json_array_length(content, '$.items') AS count
     FROM blocks
     WHERE space_id = ? AND type = 'list' AND json_extract(properties, '$.skeletonLane') = 'tensions'`
  )
    .bind(spaceId)
    .first();
  return row ? row.count : 0;
}

async function getMilestoneStats(env, spaceId) {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS total, COALESCE(SUM(json_extract(content, '$.reached')), 0) AS reached
     FROM blocks WHERE space_id = ? AND type = 'milestone'`
  )
    .bind(spaceId)
    .first();
  return { reached: row.reached, total: row.total };
}

const SPACE_COLUMNS =
  'id, title, status, template_id, tags, goal, goal_ids, categories, theme, origin, due_date, created_at, updated_at';

async function withComputedSpaceFields(env, space) {
  if (!space) return space;
  return {
    ...space,
    tags: JSON.parse(space.tags ?? '[]'),
    categories: JSON.parse(space.categories ?? '[]'),
    // Resolved on the frontend (theme/itemTheme.js), never here -- the
    // per-kind defaults are a rendering concern, so only the override
    // is ever stored.
    theme: space.theme ? JSON.parse(space.theme) : null,
    goalIds: JSON.parse(space.goal_ids || '[]'),
    isTestSpace: space.id === TEST_SPACE_ID,
    // Both of these exist so the frontend never offers a delete the
    // backend is going to refuse -- same reasoning as hiding the
    // "Move to..." picker on a Skeleton section.
    isInbox: space.id === INBOX_SPACE_ID,
    relationDensity: await getRelationDensity(env, space.id),
    openTensionCount: await getOpenTensionCount(env, space.id),
    isOverdue: Boolean(space.due_date && space.due_date < todayString()),
    milestoneStats: await getMilestoneStats(env, space.id),
  };
}

export async function listSpaces(env) {
  const { results } = await env.DB.prepare(`SELECT ${SPACE_COLUMNS} FROM spaces ORDER BY updated_at DESC`).all();
  return Promise.all(results.map((row) => withComputedSpaceFields(env, row)));
}

// Reusable for "Resources" (tag: 'resource') and any future category --
// tags are a plain JSON array on the Space, queried by membership here
// rather than filtered ad hoc wherever a tag happens to be needed. The
// Test Space is excluded, same reasoning as every other cross-Space
// listing: it's scratch content, not a real Resource/category member.
export async function listSpacesByTag(env, tag) {
  const { results } = await env.DB.prepare(
    `SELECT ${SPACE_COLUMNS} FROM spaces
     WHERE id != ? AND EXISTS (
       SELECT 1 FROM json_each(spaces.tags) WHERE json_each.value = ?
     )
     ORDER BY updated_at DESC`
  )
    .bind(TEST_SPACE_ID, tag)
    .all();
  return Promise.all(results.map((row) => withComputedSpaceFields(env, row)));
}

export async function getSpaceById(env, id) {
  const row = await env.DB.prepare(`SELECT ${SPACE_COLUMNS} FROM spaces WHERE id = ?`).bind(id).first();
  return withComputedSpaceFields(env, row);
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
export async function createSpace(
  env,
  { id = crypto.randomUUID(), title, templateId = null, status = 'active', tags = [], categories = [], origin = null, dueDate = null }
) {
  await env.DB.prepare(
    `INSERT INTO spaces (id, title, template_id, status, tags, categories, origin, due_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(id, title, templateId, status, JSON.stringify(tags), JSON.stringify(categories), origin, dueDate)
    .run();
  const summary = `Created "${title}"`;
  await logActivity(env, { spaceId: id, spaceTitle: title, kind: 'space_created', summary });
  return { ...(await getSpaceById(env, id)), changeSummary: summary };
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
export async function updateSpace(env, id, { title, status, tags, goal, categories, theme, dueDate } = {}) {
  const existing = await env.DB.prepare(`SELECT * FROM spaces WHERE id = ?`).bind(id).first();
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
  await env.DB.prepare(
    `UPDATE spaces SET title = ?, status = ?, tags = ?, goal = ?, categories = ?, theme = ?, due_date = ?, updated_at = datetime('now')
     WHERE id = ?`
  )
    .bind(next.title, next.status, next.tags, next.goal, next.categories, next.theme, next.due_date, id)
    .run();
  // changeSummary (see changeSummary.js) is a lighter-weight cousin of
  // the logActivity entry below -- a short sentence attached to the
  // response so the toast (see frontend's Toast.jsx) can say what
  // actually happened, not just "Saved". See
  // spaces.js's updateSpace exactly.
  let changeSummary = null;
  if (status !== undefined && status !== existing.status) {
    changeSummary = `Status changed to ${next.status}`;
    await logActivity(env, {
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
    // Recorded as well as toasted -- see the matching comment in
    await logActivity(env, {
      spaceId: id,
      spaceTitle: next.title,
      kind: 'space_due_date_changed',
      summary: `"${next.title}": ${changeSummary.replace(/ -- .*$/, '')}`,
    });
  }
  const result = await getSpaceById(env, id);
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
export async function deleteSpace(env, id) {
  if (id === TEST_SPACE_ID) {
    throw new Error('The Test Space cannot be deleted');
  }
  // Deleting the Inbox would take the capture destination with it, not
  // just a Space -- the next capture would silently make a new empty
  // one and the thoughts would be in the trash. Empty it entry by entry
  // instead, or file them somewhere.
  if (id === INBOX_SPACE_ID) {
    throw new Error('The Inbox cannot be deleted');
  }
  const existing = await getSpaceById(env, id);

  // Snapshot everything about to be removed, so this is undoable.
  if (existing) {
    const payload = {};
    payload.spaces = (await env.DB.prepare(`SELECT * FROM spaces WHERE id = ?`).bind(id).all()).results;
    payload.blocks = (await env.DB.prepare(`SELECT * FROM blocks WHERE space_id = ?`).bind(id).all()).results;
    payload.workspaces = (await env.DB.prepare(`SELECT * FROM workspaces WHERE space_id = ?`).bind(id).all()).results;
    // Projects are deliberately not captured: a Project no longer
    // belongs to a Space (see projects.js), so deleting one Space must
    // never take a Project other Spaces also feed with it.
    payload.trail_entries = (await env.DB.prepare(`SELECT * FROM trail_entries WHERE space_id = ?`).bind(id).all()).results;
    await recordTrash(env, { kind: 'space', label: existing.title, context: null, payload });
  }
  await env.DB.prepare(`DELETE FROM blocks WHERE space_id = ?`).bind(id).run();
  await env.DB.prepare(`DELETE FROM workspaces WHERE space_id = ?`).bind(id).run();
  await env.DB.prepare(`DELETE FROM trail_entries WHERE space_id = ?`).bind(id).run();
  await env.DB.prepare(`DELETE FROM spaces WHERE id = ?`).bind(id).run();
  if (existing) {
    await logActivity(env, {
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
export async function createSpaceWithSetup(
  env,
  { title, templateId = null, extraBlocks = [], resourceSpaceIds = [], tags = [], categories = [], workspaces = [], goal = null, origin = null }
) {
  const space = await createSpace(env, { title, templateId, tags, categories, origin });
  if (templateId) {
    await applyTemplate(env, space.id, templateId);
  }
  const workspaceIdByName = new Map();
  for (const name of workspaces) {
    const workspace = await createWorkspace(env, { spaceId: space.id, name });
    workspaceIdByName.set(name, workspace.id);
  }
  for (const { properties = {}, ...blockSpec } of extraBlocks) {
    const { workspaceNames, ...restProperties } = properties;
    const resolvedWorkspaceIds = (workspaceNames || []).map((name) => workspaceIdByName.get(name)).filter(Boolean);
    await addBlockToSpace(env, space.id, {
      ...blockSpec,
      properties: resolvedWorkspaceIds.length > 0 ? { ...restProperties, workspaces: resolvedWorkspaceIds } : restProperties,
    });
  }
  for (const targetSpaceId of resourceSpaceIds) {
    await addBlockToSpace(env, space.id, {
      type: 'reference',
      content: { target_space_id: targetSpaceId, note: null },
    });
  }
  if (goal) {
    await updateSpace(env, space.id, { goal });
  }
  return { ...(await getSpaceById(env, space.id)), changeSummary: space.changeSummary };
}

// Idempotent: creates the Test Space the first time this runs, does
// nothing after that. Nothing calls it at runtime -- a Worker has no
// boot hook to run it in, and re-checking on every request would mean a
// real extra D1 query forever for something that only has to happen
// once. Kept (and tested) because it is the one definition of what the
// Test Space is; a database that wants one gets it applied deliberately.
export async function ensureTestSpaceExists(env) {
  const existing = await getSpaceById(env, TEST_SPACE_ID);
  if (existing) return existing;
  return createSpace(env, { id: TEST_SPACE_ID, title: 'Test Space', status: 'active' });
}

// The Inbox: where a captured thought lands when you don't want to stop
// and decide where it belongs. Created on demand rather than seeded,
// unlike the Test Space -- there is nothing to show until something has
// actually been captured, and a database that never captures never
// grows one.
//
// Not idempotent by luck: the SELECT-then-INSERT is safe here because
// this app has exactly one user making one request at a time. A
// concurrent second capture could in principle race, and the cost would
// be a failed insert on a duplicate primary key, not two Inboxes.
export async function ensureInboxExists(env) {
  const existing = await getSpaceById(env, INBOX_SPACE_ID);
  if (existing) return existing;
  return createSpace(env, {
    id: INBOX_SPACE_ID,
    title: 'Inbox',
    status: 'active',
    categories: [],
  });
}

// One captured thought. Deliberately the whole thought as the entry's
// own text, not a title with an empty Space behind it: away from the
// desk the thought *is* the content, and naming it is exactly the work
// you don't want to be doing at that moment.
export async function captureToInbox(env, text) {
  const inbox = await ensureInboxExists(env);
  const block = await addBlockToSpace(env, inbox.id, { type: 'text', content: { text } });
  return { ...block, spaceId: inbox.id, changeSummary: 'Captured to your Inbox' };
}

// How much is sitting unfiled. Read alongside the needs-attention count
// so the Sidebar can show both without a second round trip.
export async function getInboxCount(env) {
  const row = await env.DB.prepare(`SELECT COUNT(*) AS count FROM blocks WHERE space_id = ?`)
    .bind(INBOX_SPACE_ID)
    .first();
  return row?.count ?? 0;
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
export async function createRelationalSpace(env, { title, spaceIds }) {
  const space = await createSpace(env, { title, tags: ['relational'] });
  await addBlockToSpace(env, space.id, { type: 'text', content: { tag: null, text: '' } });
  for (const targetSpaceId of spaceIds) {
    await addBlockToSpace(env, space.id, {
      type: 'reference',
      content: { target_space_id: targetSpaceId, note: null },
    });
  }
  return { ...(await getSpaceById(env, space.id)), changeSummary: space.changeSummary };
}

// --- Index reads for the Resources and Syntheses pages --------------------
// Both are listSpacesByTag with the one extra thing that makes each page
// worth having. Kept here rather than in a new module because they're
// Space listings that build directly on the one above -- a reader looking
// for "how does this app list Spaces" finds all of it in one place.

// Every Resource, plus what actually references it. That last part is the
// point of the page: a Resource nothing points at is one you brought in
// and never used, which nothing in the app surfaced before.
//
// Backlinks are fetched for every Resource in one query rather than one
// per Resource -- same batching reasoning listAllWorkspaces uses for its
// own member counts.
export async function listResourcesIndex(env) {
  const resources = await listSpacesByTag(env, 'resource');
  if (resources.length === 0) return [];

  const ids = resources.map((resource) => resource.id);
  const placeholders = ids.map(() => '?').join(', ');
  const { results: rows } = await env.DB.prepare(
    `SELECT json_extract(blocks.content, '$.target_space_id') AS target_id,
                blocks.space_id AS source_id,
                spaces.title AS source_title
           FROM blocks
           JOIN spaces ON spaces.id = blocks.space_id
          WHERE blocks.type = 'reference'
            AND json_extract(blocks.content, '$.target_space_id') IN (${placeholders})`
  )
    .bind(...ids)
    .all();

  // Deduplicated by Space: two Reference blocks in the same Space are
  // still one Space using this Resource, and listing it twice reads as a
  // bug rather than as information.
  const referencedBy = new Map();
  rows.forEach((row) => {
    if (!referencedBy.has(row.target_id)) referencedBy.set(row.target_id, new Map());
    referencedBy.get(row.target_id).set(row.source_id, {
      spaceId: row.source_id,
      spaceTitle: row.source_title,
    });
  });

  return resources.map((resource) => {
    const references = [...(referencedBy.get(resource.id)?.values() || [])];
    // A promoted Synthesis carries the 'resource' tag too, but its
    // Synthesis kind ('essay', 'poem') is not a *Resource* type -- left
    // in, it invents bogus type groups on the Resources page. So it's
    // flagged as produced here instead and grouped on that.
    const producedHere = (resource.tags || []).includes('synthesis');
    return {
      ...resource,
      producedHere,
      // The type tags are whatever isn't structural -- 'book', 'lens',
      // 'person', and anything else freely typed in.
      typeTags: producedHere
        ? []
        : (resource.tags || []).filter((tag) => tag !== 'resource'),
      referencedBy: references,
      referenceCount: references.length,
    };
  });
}

// Every Synthesis, plus what it was distilled from. CreateSynthesis.jsx
// records the source Work items on its own "Source Material" block as
// properties.sourceItemIds; this resolves those forward into the actual
// items and the Spaces they came from, which is what makes a Synthesis
// legible as something *produced* rather than just another Space.
export async function listSynthesesIndex(env) {
  const syntheses = await listSpacesByTag(env, 'synthesis');
  if (syntheses.length === 0) return [];

  const ids = syntheses.map((synthesis) => synthesis.id);
  const placeholders = ids.map(() => '?').join(', ');
  const { results: rows } = await env.DB.prepare(
    `SELECT blocks.space_id AS synthesis_id,
                source.id AS item_id,
                source.type AS item_type,
                source.content AS item_content,
                source_space.id AS source_space_id,
                source_space.title AS source_space_title
           FROM blocks
           JOIN json_each(blocks.properties, '$.sourceItemIds') AS item
           JOIN blocks AS source ON source.id = item.value
           JOIN spaces AS source_space ON source_space.id = source.space_id
          WHERE blocks.space_id IN (${placeholders})`
  )
    .bind(...ids)
    .all();

  const lineage = new Map();
  rows.forEach((row) => {
    if (!lineage.has(row.synthesis_id)) lineage.set(row.synthesis_id, []);
    lineage.get(row.synthesis_id).push({
      blockId: row.item_id,
      type: row.item_type,
      // A Work item's headline is its statement; a source item that has
      // since been edited shows its current text, not what was copied.
      statement: JSON.parse(row.item_content).statement || '',
      spaceId: row.source_space_id,
      spaceTitle: row.source_space_title,
    });
  });

  return syntheses.map((synthesis) => {
    const drawnFrom = lineage.get(synthesis.id) || [];
    return {
      ...synthesis,
      // A Synthesis's kind is the freely-chosen tag alongside 'synthesis'
      // -- 'resource' is excluded because that one means promoted, not a
      // kind of piece.
      kinds: (synthesis.tags || []).filter((tag) => tag !== 'synthesis' && tag !== 'resource'),
      promoted: (synthesis.tags || []).includes('resource'),
      drawnFrom,
      sourceSpaceCount: new Set(drawnFrom.map((item) => item.spaceId)).size,
    };
  });
}
