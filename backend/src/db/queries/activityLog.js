import { randomUUID } from 'node:crypto';
import { db } from '../index.js';
import { TEST_SPACE_ID } from './constants.js';

// The Log: a global activity feed, deliberately scoped to structural
// lifecycle events -- a Space/block/Template created or removed, a
// Space's status changing -- not every keystroke-level content edit
// (a List item's text, a checkbox toggle). Logging every edit would
// bury the events actually worth seeing trends in; the finer-grained
// Skeleton history already has a home in Trail, which the Log page
// merges in separately rather than duplicating here. The Test Space is
// excluded, same reasoning as everywhere else it's excluded: scratch
// content, not real activity.
//
// Kept in its own tiny module (rather than living in spaces.js, where
// it did in the original single-file queries.js) because it's called
// from spaces.js, templates.js, blocks.js, and workspaces.js -- giving
// it a home in any one of those would make the other three import from
// it, which is a strange dependency direction for a cross-cutting
// logging helper. Not part of the public queries.js barrel: it never
// was exported outside this file before the split, and routes still
// have no reason to call it directly.
export function logActivity({ spaceId = null, spaceTitle = null, kind, summary }) {
  if (spaceId === TEST_SPACE_ID) return;
  db.prepare(
    `INSERT INTO activity_log (id, space_id, space_title, kind, summary) VALUES (?, ?, ?, ?, ?)`
  ).run(randomUUID(), spaceId, spaceTitle, kind, summary);
}
