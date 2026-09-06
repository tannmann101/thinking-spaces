// The Log: a global activity feed of what has actually happened -- a
// Space/entry/Template created or removed, a Space's status changing,
// an entry edited, a Milestone reached.
//
// Content edits used to be left out entirely, on the reasoning that
// logging every one would bury the events worth seeing trends in. That
// turned out to cost more than it saved: Trail (the per-Space history)
// only ever wrote itself on a Skeleton edit, so a Space where the
// person never used the promotion shorthand had *no* recorded history
// at all -- 51 Spaces created and 98 entries added, and not one Trail
// entry to show for it. Edits are recorded now, but coalesced (see
// logBlockEdit below) so a long writing session reads as one line
// rather than twenty, which is what the original concern was actually
// about. The Test Space is still excluded, same reasoning as
// everywhere else: scratch content, not real activity.
//
// Kept in its own tiny module (rather than living in spaces.js, where
// it did in the original single-file queries.js) because it's called
// from spaces.js, templates.js, blocks.js, and workspaces.js -- giving
// it a home in any one of those would make the other three import from
// it, which is a strange dependency direction for a cross-cutting
// logging helper. Not part of the public queries.js barrel: it never
// was exported outside this file before the split, and routes still
// have no reason to call it directly.

import { TEST_SPACE_ID } from './constants.js';

// The Log: a global activity feed of what has actually happened -- a
// Space/entry/Template created or removed, a Space's status changing,
// an entry edited, a Milestone reached.
//
// Content edits used to be left out entirely, on the reasoning that
// logging every one would bury the events worth seeing trends in. That
// turned out to cost more than it saved: Trail (the per-Space history)
// only ever wrote itself on a Skeleton edit, so a Space where the
// person never used the promotion shorthand had *no* recorded history
// at all -- 51 Spaces created and 98 entries added, and not one Trail
// entry to show for it. Edits are recorded now, but coalesced (see
// logBlockEdit below) so a long writing session reads as one line
// rather than twenty, which is what the original concern was actually
// about. The Test Space is still excluded, same reasoning as
// everywhere else: scratch content, not real activity.
//
// Kept in its own tiny module (rather than living in spaces.js, where
// it did in the original single-file queries.js) because it's called
// from spaces.js, templates.js, blocks.js, and workspaces.js -- giving
// it a home in any one of those would make the other three import from
// it, which is a strange dependency direction for a cross-cutting
// logging helper. Not part of the public queries.js barrel: it never
// was exported outside this file before the split, and routes still
// have no reason to call it directly.
export async function logActivity(env, { spaceId = null, spaceTitle = null, blockId = null, kind, summary }) {
  if (spaceId === TEST_SPACE_ID) return;
  await env.DB.prepare(
    `INSERT INTO activity_log (id, space_id, space_title, block_id, kind, summary) VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(crypto.randomUUID(), spaceId, spaceTitle, blockId, kind, summary)
    .run();
}

// How long repeated edits to the same entry keep folding into one row.
// See logBlockEdit above for the full reasoning.
const EDIT_COALESCE_MINUTES = 10;

// An ordinary content edit. Unlike every other kind, this one folds
// into the previous row when it's the same entry being edited again
// shortly after -- bumping that row's event_count and its timestamp
// instead of inserting another. Without this, saving a paragraph five
// times while writing it would read as five separate events, which is
// exactly the noise that kept edits out of the Log in the first place.
//
// Deliberately only for the unremarkable case: a change with a real,
// nameable implication (a Milestone reached) goes through logActivity
// as its own row and never coalesces, since it happened once and
// saying so twice would be wrong.
export async function logBlockEdit(env, { spaceId, spaceTitle, blockId, summary }) {
  if (spaceId === TEST_SPACE_ID) return;
  const recent = await env.DB.prepare(
    `SELECT id, event_count FROM activity_log
      WHERE block_id = ? AND kind = 'block_edited'
        AND created_at >= datetime('now', ?)
      ORDER BY created_at DESC
      LIMIT 1`
  )
    .bind(blockId, `-${EDIT_COALESCE_MINUTES} minutes`)
    .first();

  if (recent) {
    await env.DB.prepare(
      `UPDATE activity_log SET event_count = ?, created_at = datetime('now') WHERE id = ?`
    )
      .bind(recent.event_count + 1, recent.id)
      .run();
    return;
  }

  await env.DB.prepare(
    `INSERT INTO activity_log (id, space_id, space_title, block_id, kind, summary) VALUES (?, ?, ?, ?, 'block_edited', ?)`
  )
    .bind(crypto.randomUUID(), spaceId, spaceTitle, blockId, summary)
    .run();
}
