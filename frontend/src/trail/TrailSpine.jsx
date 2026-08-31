// The Trail: a history spine for one Space. "auto" entries are logged
// by the backend whenever a Skeleton structural change happens
// (saveTextBlockWithPromotion); "manual" entries are added here by the
// person, with a narrative "why". Collapsed rows show type + date only,
// per the doc -- expanding reveals the summary/note, an optional
// attached "why" for an auto entry, and Rewind: a read-only Now-vs-As-of
// comparison of the Skeleton against how it stood at that entry.

import { useState } from 'react';
import { addTrailNote, updateTrailNote, getCurrentSkeleton } from '../api.js';

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
        {entry.kind === 'manual' ? 'Note' : 'Auto'} — {formatDate(entry.created_at)}
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

  return (
    <div className="trail-section">
      <h3>Trail</h3>
      {entries.length === 0 && <p>No history yet.</p>}
      {entries.length > 0 && (
        <ul className="trail-list">
          {entries.map((entry) => (
            <TrailEntryRow key={entry.id} entry={entry} spaceId={spaceId} onEntryChanged={onEntryAdded} />
          ))}
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
    </div>
  );
}

export default TrailSpine;
