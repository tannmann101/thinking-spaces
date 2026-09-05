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
import Sidebar from '../components/Sidebar.jsx';
import { usePageTitle } from '../hooks/usePageTitle.js';

const KIND_LABELS = {
  space_created: 'Space',
  space_deleted: 'Space',
  space_status_changed: 'Status',
  block_added: 'Tool',
  block_removed: 'Tool',
  block_edited: 'Edit',
  block_changed: 'Change',
  space_due_date_changed: 'Due date',
  workspace_created: 'Workspace',
  workspace_deleted: 'Workspace',
  project_created: 'Project',
  project_deleted: 'Project',
  template_created: 'Template',
  template_updated: 'Template',
  template_deleted: 'Template',
  resource_template_created: 'Resource Template',
  resource_template_updated: 'Resource Template',
  resource_template_deleted: 'Resource Template',
  trail_auto: 'Trail',
  trail_manual: 'Trail',
  trail_review: 'Review',
};

function toLocalDate(isoLikeString) {
  return new Date(isoLikeString.replace(' ', 'T') + 'Z');
}

function formatDayHeading(isoLikeString) {
  return toLocalDate(isoLikeString).toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatTime(isoLikeString) {
  return toLocalDate(isoLikeString).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

// A day-key for grouping -- the calendar day this entry's timestamp
// falls on in the viewer's own local time, so entries near midnight
// group the way a person would actually expect, not by raw UTC date.
function dayKey(isoLikeString) {
  const date = toLocalDate(isoLikeString);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

// How many entries to reveal per "Show more" click. Entries arrive
// newest-first already (see listGlobalActivity), so a flat page size
// rather than a day count keeps each click's cost predictable
// regardless of how many events happened to land on one day.
const PAGE_SIZE = 40;

function LogPage() {
  usePageTitle('Log');
  const [activity, setActivity] = useState(null);
  const [error, setError] = useState(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    getActivity().then(setActivity).catch((err) => setError(err.message));
  }, []);

  return (
    <div className="app-shell">
      <Sidebar current="log" />
      <main className="app-content">
      <h1>Log</h1>
      {/* See the matching comment on Dashboard.jsx -- one honest line
          per page in a closed loop, naming what this page is and
          pointing at its two nearest neighbors. Also fixes a small
          clarity gap the same audit found: the old copy said "oldest
          and newest in one place," but the feed below has always shown
          newest first. */}
      <p>
        The complete structural record across every Space, newest first -- every Tool and Space
        created or removed, merged with each Space's own Trail. For trends distilled from all of
        it, see Insights; for one Space's own narrative, see its Trail.
      </p>

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
          {activity.entries.length > 0 &&
            (() => {
              const visible = activity.entries.slice(0, visibleCount);
              // Group consecutive entries sharing a calendar day under one
              // heading, rather than repeating the full date on every row --
              // entries already arrive newest-first, so this never needs to
              // re-sort, only to notice when the day key changes.
              const groups = [];
              for (const entry of visible) {
                const key = dayKey(entry.created_at);
                const lastGroup = groups[groups.length - 1];
                if (lastGroup && lastGroup.key === key) {
                  lastGroup.entries.push(entry);
                } else {
                  groups.push({ key, heading: formatDayHeading(entry.created_at), entries: [entry] });
                }
              }
              return (
                <>
                  {groups.map((group) => (
                    <div key={group.key} className="log-day-group">
                      <h2 className="log-day-heading">{group.heading}</h2>
                      <ul className="log-list">
                        {group.entries.map((entry) => (
                          <li key={entry.id}>
                            <span className="log-kind-tag">{KIND_LABELS[entry.kind] || entry.kind}</span>
                            {entry.space_id ? (
                              <Link
                                to={
                                  entry.block_id
                                    ? `/spaces/${entry.space_id}?highlight=${entry.block_id}`
                                    : `/spaces/${entry.space_id}`
                                }
                              >
                                {entry.summary}
                              </Link>
                            ) : (
                              <span>{entry.summary}</span>
                            )}
                            {/* A coalesced edit row stands for several
                                occurrences (see logBlockEdit) -- saying
                                so is the honest alternative to either
                                twenty rows or a silently lossy one. */}
                            {entry.event_count > 1 && (
                              <span className="log-event-count"> &times;{entry.event_count}</span>
                            )}
                            <span className="log-timestamp">{formatTime(entry.created_at)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                  {visibleCount < activity.entries.length && (
                    <p className="log-show-more">
                      <button type="button" className="btn-ghost-small" onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}>
                        Show {Math.min(PAGE_SIZE, activity.entries.length - visibleCount)} more
                      </button>{' '}
                      <span className="mono-caption">
                        ({visible.length} of {activity.entries.length} shown)
                      </span>
                    </p>
                  )}
                </>
              );
            })()}
        </>
      )}
      </main>
    </div>
  );
}

export default LogPage;
