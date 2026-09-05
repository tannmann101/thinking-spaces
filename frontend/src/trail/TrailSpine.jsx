// The Trail: a history spine for one Space.
//
// Two kinds of row share it, and the difference is real rather than
// cosmetic. A **Trail entry** carries a full Skeleton snapshot and an
// editable note: "auto" ones are logged by the backend on a Skeleton
// structural change (saveTextBlockWithPromotion), "manual" ones are a
// narrative "why" typed here, and "review" ones (see ReviewStarter
// below) are a deliberate structured look-back. Collapsed they show
// type + date; expanding reveals the summary/note, the attached "why",
// and Rewind -- a read-only Now-vs-As-of comparison of the Skeleton
// against how it stood at that moment.
//
// An **activity row** is a plain recorded fact -- an entry added,
// edited, a Milestone reached, the status changed. It has no snapshot
// and no note, so it doesn't expand; pretending otherwise would offer
// a Rewind that couldn't reconstruct anything.
//
// Trail used to show only the first kind, which meant it was empty on
// essentially every real Space: an auto entry only ever wrote itself
// on a Skeleton edit, so unless you worked through the promotion
// shorthand there was nothing here at all, while the Space's real
// activity was being recorded elsewhere the whole time. See
// listSpaceHistory in backend/src/db/queries/trail.js.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { addTrailNote, updateTrailNote, getCurrentSkeleton, getReviewDraft, createReview } from '../api.js';

function formatDate(isoLikeString) {
  return new Date(isoLikeString.replace(' ', 'T') + 'Z').toLocaleString();
}

// Renders one Skeleton reading (a snapshot or the live "Now" state) --
// both are the exact same {lanes, articulation} shape, since Now comes
// from the same getSkeletonSnapshot function a stored snapshot was
// built from. Shared so the two Rewind columns can't drift apart.
function SkeletonReading({ snapshot }) {
  return (
    <>
      {Object.values(snapshot.lanes).map((lane) => (
        <div key={lane.label}>
          <strong>{lane.label}</strong>
          <ul>
            {lane.items.length === 0 && <li>(empty)</li>}
            {lane.items.map((item) => (
              <li key={item.id}>{item.text}</li>
            ))}
          </ul>
        </div>
      ))}
      <p>
        <strong>Current Best Articulation:</strong> {snapshot.articulation || '(empty)'}
      </p>
    </>
  );
}

function RewindCompare({ entry, currentSkeleton }) {
  if (!currentSkeleton) {
    return <p><em>Loading current Skeleton state...</em></p>;
  }
  return (
    <div className="rewind-compare">
      <div className="rewind-column">
        <h5>Now</h5>
        <SkeletonReading snapshot={currentSkeleton} />
      </div>
      <div className="rewind-column">
        <h5>As of {formatDate(entry.created_at)}</h5>
        <SkeletonReading snapshot={entry.skeleton_snapshot} />
      </div>
    </div>
  );
}

// The "why": an auto entry writes itself with only a short computed
// summary (e.g. "Promoted: 2 Premises"), and can optionally get a
// manual note attached afterward explaining why -- entries used to be
// write-once, with no way to do this. A manual entry's own note is
// editable the same way, for fixing a typo in what you originally wrote.
function TrailNoteEditor({ entry, spaceId, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.note || '');
  const [saving, setSaving] = useState(false);

  async function save(event) {
    event.preventDefault();
    if (!draft.trim()) return;
    setSaving(true);
    await updateTrailNote(spaceId, entry.id, draft.trim());
    setSaving(false);
    setEditing(false);
    onSaved();
  }

  if (editing) {
    return (
      <form onSubmit={save} className="add-item-row">
        <input
          type="text"
          value={draft}
          autoFocus
          placeholder="Why did this happen?"
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit" className="btn-ghost-small" disabled={saving || !draft.trim()}>
          Save
        </button>
      </form>
    );
  }

  if (entry.note) {
    return (
      <p className="trail-why">
        <em>Why:</em> {entry.note}{' '}
        <span
          className="editable-toggle"
          onClick={() => {
            setDraft(entry.note);
            setEditing(true);
          }}
        >
          (edit)
        </span>
      </p>
    );
  }

  return (
    <button
      type="button"
      className="btn-ghost-small"
      onClick={() => {
        setDraft('');
        setEditing(true);
      }}
    >
      + Add a why
    </button>
  );
}

const ENTRY_KIND_LABELS = { manual: 'Note', review: 'Review' };

// What a recorded activity row is called on this page. Deliberately
// shorter than the Log page's own labels: there, a row has to say which
// Space it belongs to, whereas here every row is about this Space
// already, so the label only needs to name what kind of thing happened.
const ACTIVITY_KIND_LABELS = {
  space_created: 'Created',
  space_status_changed: 'Status',
  space_due_date_changed: 'Due date',
  block_added: 'Added',
  block_removed: 'Removed',
  block_edited: 'Edited',
  block_changed: 'Changed',
  workspace_created: 'Workspace',
  workspace_deleted: 'Workspace',
};

// A recorded fact: no snapshot to rewind to, no note to attach, so this
// stays a single flat line rather than an expandable one. It links
// through to the entry it's about when there still is one -- reusing
// the ?highlight= convention the Dashboard and Insights already use.
function ActivityRow({ entry, spaceId }) {
  return (
    <li className="trail-activity-row">
      <span className="trail-activity-kind">{ACTIVITY_KIND_LABELS[entry.kind] || 'Activity'}</span>{' '}
      {entry.block_id ? (
        <Link to={`/spaces/${spaceId}?highlight=${entry.block_id}`}>{entry.summary}</Link>
      ) : (
        entry.summary
      )}
      {entry.event_count > 1 && <span className="trail-activity-count"> &times;{entry.event_count}</span>}
      <span className="trail-activity-date"> {formatDate(entry.created_at)}</span>
    </li>
  );
}

function TrailEntryRow({ entry, spaceId, onEntryChanged }) {
  const [expanded, setExpanded] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [currentSkeleton, setCurrentSkeleton] = useState(null);

  async function toggleCompare() {
    if (!comparing && !currentSkeleton) {
      setCurrentSkeleton(await getCurrentSkeleton(spaceId));
    }
    setComparing(!comparing);
  }

  return (
    <li>
      <span
        className="editable-toggle"
        onClick={() => setExpanded(!expanded)}
        title="Click to expand"
      >
        {ENTRY_KIND_LABELS[entry.kind] || 'Auto'} — {formatDate(entry.created_at)}
      </span>
      {expanded && (
        <div>
          <p>{entry.kind === 'manual' ? entry.note : entry.summary}</p>
          <TrailNoteEditor entry={entry} spaceId={spaceId} onSaved={onEntryChanged} />
          <p>
            <button type="button" className="btn-ghost-small" onClick={toggleCompare}>
              {comparing ? 'Return to Now' : 'Compare to Now'}
            </button>
          </p>
          {comparing && <RewindCompare entry={entry} currentSkeleton={currentSkeleton} />}
        </div>
      )}
    </li>
  );
}

// A Review is the Time arc's third layer: a deliberate, structured
// look-back, distinct from typing a manual "why" note. "Start a
// Review" fetches a read-only preview of what it would say (see
// getReviewDraft) so the person sees exactly what's about to become a
// permanent Trail entry before committing to it; "Log this Review"
// then writes that same computed summary via createReview. Once
// logged, the new entry renders through the ordinary TrailEntryRow
// above like any other -- Rewind and the note-adding flow both just
// work, since a Review is still only ever a trail_entries row.
function ReviewStarter({ spaceId, onReviewCreated }) {
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  async function loadDraft() {
    setLoading(true);
    setDraft(await getReviewDraft(spaceId));
    setLoading(false);
  }

  async function confirmReview() {
    setCreating(true);
    await createReview(spaceId);
    setCreating(false);
    setDraft(null);
    onReviewCreated();
  }

  if (!draft) {
    return (
      <p>
        <button type="button" className="btn-ghost-small" onClick={loadDraft} disabled={loading}>
          {loading ? 'Checking what changed...' : 'Start a Review'}
        </button>
      </p>
    );
  }

  return (
    <div className="review-draft">
      <p className="review-draft-summary">{draft.summaryText}</p>
      {draft.blocksAdded.length > 0 && (
        <ul className="review-draft-list">
          {draft.blocksAdded.map((entry) => (
            <li key={entry.type}>
              {entry.count} {entry.type}
            </li>
          ))}
        </ul>
      )}
      {draft.milestonesReached.length > 0 && (
        <ul className="review-draft-list">
          {draft.milestonesReached.map((milestone) => (
            <li key={milestone.label}>
              Reached: {milestone.label} ({milestone.reachedAt})
            </li>
          ))}
        </ul>
      )}
      {draft.sessionsCompleted.length > 0 && (
        <ul className="review-draft-list">
          {draft.sessionsCompleted.map((session, index) => (
            <li key={index}>
              {session.label}: {session.durationMinutes} min
            </li>
          ))}
        </ul>
      )}
      <p>
        <button type="button" className="btn-ghost-small" onClick={confirmReview} disabled={creating}>
          Log this Review
        </button>{' '}
        <button type="button" className="btn-ghost-small" onClick={() => setDraft(null)}>
          Cancel
        </button>
      </p>
    </div>
  );
}

function TrailSpine({ spaceId, entries, onEntryAdded }) {
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submitNote(event) {
    event.preventDefault();
    if (!draft.trim()) return;
    setSubmitting(true);
    await addTrailNote(spaceId, draft.trim());
    setDraft('');
    setSubmitting(false);
    onEntryAdded();
  }

  // The "Trail" heading and its framing sentence used to live here,
  // wrapped in their own .trail-section div -- both moved out to
  // SpacePage.jsx once Trail became one of the Space page's three
  // adaptive-density panels (see space-collapsible-panel in index.css
  // and the Roadmap entry on the coherence audit's second thread),
  // since a <details>'s own <summary> now provides that same label and
  // an extra inner heading would just duplicate it.
  return (
    <>
      <ReviewStarter spaceId={spaceId} onReviewCreated={onEntryAdded} />
      {entries.length === 0 && <p>No history yet.</p>}
      {entries.length > 0 && (
        <ul className="trail-list">
          {entries.map((entry) =>
            entry.source === 'activity' ? (
              <ActivityRow key={entry.id} entry={entry} spaceId={spaceId} />
            ) : (
              <TrailEntryRow key={entry.id} entry={entry} spaceId={spaceId} onEntryChanged={onEntryAdded} />
            )
          )}
        </ul>
      )}
      <form onSubmit={submitNote} className="add-item-row">
        <input
          type="text"
          value={draft}
          placeholder="Add a note to the Trail..."
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit" className="btn" disabled={submitting || !draft.trim()}>
          Add
        </button>
      </form>
    </>
  );
}

export default TrailSpine;
