// Renders one Session block: a timed sitting of work. Start it, stop
// it, the elapsed time gets logged -- the first thing in this app with
// genuinely live/running state (see registry/blocks.js's `family:
// 'time'`), unlike everything else here which only changes when
// someone edits it.
//
// `startedAt` is the source of truth for a running session, not a
// client-side ticking counter: elapsed time is always computed fresh
// from it (now - startedAt), so a session that's been running since
// before the tab was last closed still reads correctly the moment
// it's opened again -- nothing is lost by not having a live connection.

import { useEffect, useState } from 'react';
import { updateBlockContent } from '../api.js';

function formatDuration(minutes) {
  if (minutes == null) return null;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

// onSave lets a parent block (Comparison) override where an edit goes,
// same pattern every other simple Block already follows (see
// ReferenceBlock.jsx). onBlocksChanged tells the page to refetch after
// a standalone save.
function SessionBlock({ block, onSave, onBlocksChanged }) {
  const editable = Boolean(block.id) || Boolean(onSave);
  const { label, startedAt, endedAt, durationMinutes, note } = block.content;
  const isRunning = Boolean(startedAt) && !endedAt;

  // Only ticks while actually running, and only to refresh this
  // component's own "elapsed so far" display -- nothing is written to
  // the block until Stop is clicked.
  // Lazy initializer: Date.now() should only ever be called once, at
  // mount, not re-evaluated on every render the way a bare `Date.now()`
  // argument would be (React only uses that value once, but the impure
  // call itself would still fire every render).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!isRunning) return undefined;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [isRunning]);

  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState(label || '');
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState(note || '');

  async function persist(patch) {
    const newContent = { label, startedAt, endedAt, durationMinutes, note: note || '', ...patch };
    if (onSave) {
      await onSave(newContent);
    } else {
      await updateBlockContent(block.id, newContent);
      onBlocksChanged?.();
    }
  }

  async function finishLabel() {
    setEditingLabel(false);
    if (labelDraft === (label || '')) return;
    await persist({ label: labelDraft.trim() });
  }

  async function finishNote() {
    setEditingNote(false);
    if (noteDraft === (note || '')) return;
    await persist({ note: noteDraft.trim() });
  }

  async function start() {
    await persist({ startedAt: new Date().toISOString(), endedAt: null, durationMinutes: null });
  }

  async function stop() {
    const endedAtValue = new Date().toISOString();
    const minutes = Math.max(0, Math.round((new Date(endedAtValue) - new Date(startedAt)) / 60000));
    await persist({ endedAt: endedAtValue, durationMinutes: minutes });
  }

  const liveElapsedMinutes = isRunning ? Math.floor((now - new Date(startedAt).getTime()) / 60000) : null;

  return (
    <div className={`session-block${isRunning ? ' session-running' : ''}`}>
      <p className="session-label-row">
        {editingLabel ? (
          <input
            type="text"
            value={labelDraft}
            autoFocus
            style={{ fontFamily: 'inherit', fontSize: 'inherit', fontWeight: 'inherit', flex: 1 }}
            onChange={(event) => setLabelDraft(event.target.value)}
            onBlur={finishLabel}
            onKeyDown={(event) => event.key === 'Enter' && finishLabel()}
          />
        ) : (
          <span
            className={editable ? 'editable' : undefined}
            onClick={() => {
              if (!editable) return;
              setLabelDraft(label || '');
              setEditingLabel(true);
            }}
          >
            {label || '(untitled session -- click to name it)'}
          </span>
        )}
      </p>
      <p className="session-meta-row">
        {!startedAt && editable && (
          <button type="button" className="btn-ghost-small" onClick={start}>
            ▶ Start
          </button>
        )}
        {isRunning && (
          <>
            <span className="session-elapsed">Running -- {formatDuration(liveElapsedMinutes) || '0m'} elapsed</span>
            {editable && (
              <button type="button" className="btn-ghost-small" onClick={stop}>
                ■ Stop
              </button>
            )}
          </>
        )}
        {endedAt && (
          <span className="session-completed">
            {formatDuration(durationMinutes)} -- {new Date(startedAt).toLocaleString()} to{' '}
            {new Date(endedAt).toLocaleString()}
          </span>
        )}
      </p>
      {editingNote ? (
        <textarea
          value={noteDraft}
          autoFocus
          rows={2}
          style={{ width: '100%' }}
          onChange={(event) => setNoteDraft(event.target.value)}
          onBlur={finishNote}
        />
      ) : (
        <p
          className={editable ? 'editable session-note' : 'session-note'}
          onClick={() => {
            if (!editable) return;
            setNoteDraft(note || '');
            setEditingNote(true);
          }}
        >
          {note || (editable ? '(add a note)' : '')}
        </p>
      )}
    </div>
  );
}

export default SessionBlock;
