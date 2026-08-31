// The Log: a global, cross-Space activity feed -- every structural
// lifecycle event (a Space/Tool/Template created, removed, or a
// Space's status changing) merged with the Trail (the finer-grained
// Skeleton history each Space already keeps). This is "everything",
// read straight from listGlobalActivity/getActivityStats in
// backend/src/db/queries.js -- nothing here is computed client-side.
//
// It deliberately does not log every keystroke-level content edit (a
// List item's text, a checkbox toggle) -- that would bury the events
// actually worth seeing trends in. See the comment on logActivity in
// queries.js for the full reasoning.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getActivity } from '../api.js';

const KIND_LABELS = {
  space_created: 'Space',
  space_deleted: 'Space',
  space_status_changed: 'Status',
  block_added: 'Tool',
  block_removed: 'Tool',
  workspace_created: 'Workspace',
  workspace_deleted: 'Workspace',
  template_created: 'Template',
  template_updated: 'Template',
  template_deleted: 'Template',
  trail_auto: 'Trail',
  trail_manual: 'Trail',
  trail_review: 'Review',
};

function formatDate(isoLikeString) {
  return new Date(isoLikeString.replace(' ', 'T') + 'Z').toLocaleString();
}

function LogPage() {
  const [activity, setActivity] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getActivity().then(setActivity).catch((err) => setError(err.message));
  }, []);

  return (
    <main>
      <Link to="/" className="back-link">
        &larr; Back to Dashboard
      </Link>
      <h1>Log</h1>
      <p>Everything that's happened, across every Space, oldest and newest in one place.</p>

      {error && <p>Could not load the Log: {error}</p>}
      {!error && !activity && <p>Loading...</p>}

      {activity && (
        <>
          <div className="log-stats">
            <div className="view-card">
              <h3>Total events</h3>
              <p className="log-stat-number">{activity.stats.totalCount}</p>
            </div>
            <div className="view-card">
              <h3>Last 7 days</h3>
              <p className="log-stat-number">{activity.stats.last7Days}</p>
            </div>
            <div className="view-card">
              <h3>Most active Space</h3>
              <p className="log-stat-number">
                {activity.stats.mostActive ? activity.stats.mostActive.space_title : '—'}
              </p>
              {activity.stats.mostActive && (
                <p className="progress-stat">{activity.stats.mostActive.count} events</p>
              )}
            </div>
          </div>

          {activity.entries.length === 0 && <p>No activity yet.</p>}
          {activity.entries.length > 0 && (
            <ul className="log-list">
              {activity.entries.map((entry) => (
                <li key={entry.id}>
                  <span className="log-kind-tag">{KIND_LABELS[entry.kind] || entry.kind}</span>
                  {entry.space_id ? (
                    <Link to={`/spaces/${entry.space_id}`}>{entry.summary}</Link>
                  ) : (
                    <span>{entry.summary}</span>
                  )}
                  <span className="log-timestamp">{formatDate(entry.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}

export default LogPage;
