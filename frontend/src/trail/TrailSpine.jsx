// The Trail: a history spine for one Space. "auto" entries are logged
// by the backend whenever a Skeleton structural change happens
// (saveTextBlockWithPromotion); "manual" entries are added here by the
// person, with a narrative "why". Collapsed shows type + date only,
// per the doc -- expanding reveals the summary/note and a Rewind
// snapshot of the Skeleton's state at that point.

import { useState } from 'react';
import { addTrailNote } from '../api.js';
import { SKELETON_LANE_LABELS } from '../registry/skeleton.js';

function formatDate(isoLikeString) {
  return new Date(isoLikeString.replace(' ', 'T') + 'Z').toLocaleString();
}

function RewindSnapshot({ entry }) {
  const { lanes, articulation } = entry.skeleton_snapshot;
  return (
    <div style={{ border: '1px solid #999', padding: '10px', marginTop: '6px' }}>
      <p>
        <em>Read-only Skeleton snapshot from {formatDate(entry.created_at)}</em>
      </p>
      {SKELETON_LANE_LABELS.map(({ key, label }) => (
        <div key={key}>
          <strong>{label}</strong>
          <ul>
            {(lanes[key] || []).length === 0 && <li>(empty)</li>}
            {(lanes[key] || []).map((item) => (
              <li key={item.id}>{item.text}</li>
            ))}
          </ul>
        </div>
      ))}
      <p>
        <strong>Current Best Articulation:</strong> {articulation || '(empty)'}
      </p>
    </div>
  );
}

function TrailEntryRow({ entry }) {
  const [expanded, setExpanded] = useState(false);
  const [showRewind, setShowRewind] = useState(false);

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
          <button type="button" onClick={() => setShowRewind(!showRewind)}>
            {showRewind ? 'Hide' : 'View'} Skeleton state at this point
          </button>
          {showRewind && <RewindSnapshot entry={entry} />}
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
    <div>
      <h3>Trail</h3>
      {entries.length === 0 && <p>No history yet.</p>}
      {entries.length > 0 && (
        <ul>
          {entries.map((entry) => (
            <TrailEntryRow key={entry.id} entry={entry} />
          ))}
        </ul>
      )}
      <form onSubmit={submitNote} style={{ display: 'flex', gap: '6px' }}>
        <input
          type="text"
          value={draft}
          placeholder="Add a note to the Trail..."
          style={{ flex: 1 }}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit" disabled={submitting || !draft.trim()}>
          Add
        </button>
      </form>
    </div>
  );
}

export default TrailSpine;
