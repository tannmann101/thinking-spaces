import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getSpaces,
  getSpacesByTag,
  getOverdueReviews,
  getWeekCalendar,
  getResurfaceSuggestion,
  deleteSpace,
  updateBlockContent,
  createReview,
} from '../api.js';
import SpaceGlyph, { SPACE_STATUSES } from '../glyph/SpaceGlyph.jsx';
import { useConfirmDialog } from '../components/ConfirmDialog.jsx';
import Sidebar from '../components/Sidebar.jsx';
import { usePageTitle } from '../hooks/usePageTitle.js';

function formatDate(isoLikeString) {
  // SQLite's datetime('now') gives "YYYY-MM-DD HH:MM:SS" (UTC, no "T"/"Z"),
  // which Date() won't parse correctly unless we normalize it first.
  return new Date(isoLikeString.replace(' ', 'T') + 'Z').toLocaleString();
}

// Every digest below renders as a native <details>, not a plain
// <section> -- with up to five of these able to stack above the Space
// list, collapsing the ones you don't need right now is what keeps
// that stack from just being "more scrolling before the actual list."
// Native and boring on purpose: no state to manage, no persistence
// needed, the browser already does this correctly.
function OverdueReviews({ items }) {
  if (items.length === 0) return null;
  return (
    <details className="digest" data-digest="overdue" open>
      <summary>
        <span className="digest-icon">!</span>Overdue for review
      </summary>
      <ul>
        {items.map(({ spaceId, spaceTitle, blockId, item }) => (
          <li key={item.id}>
            <Link to={`/spaces/${spaceId}?highlight=${blockId}`}>{spaceTitle}</Link>: {item.text} (was due {item.reviewBy})
          </li>
        ))}
      </ul>
    </details>
  );
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// getWeekCalendar's days are plain 'YYYY-MM-DD' strings -- parsed as
// explicit local year/month/day components, not `new Date(isoString)`
// (which reads a bare date as UTC midnight and can print the wrong
// weekday/day-of-month depending on the viewer's own timezone).
function parseLocalDate(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatShort(isoDate) {
  return parseLocalDate(isoDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// The Space ids that were genuinely active this week -- Trail activity,
// a Milestone actually reached, or a Session that actually completed.
// A due date passing on its own isn't a change worth reviewing, so
// dueSpaces is deliberately not part of this union.
function computeActiveSpaceIds(days) {
  const ids = new Set();
  for (const day of days) {
    for (const entry of day.trail) ids.add(entry.space_id);
    for (const m of day.milestones) if (m.reached) ids.add(m.spaceId);
    for (const s of day.sessions) if (!s.isRunning) ids.add(s.spaceId);
  }
  return ids;
}

// A real calendar grid, not a flat list -- the whole point is that
// "what does 'this week' mean" is answered just by looking at the day
// labels and the actual dates in the header, rather than being a fact
// only the code knew. Each day mixes what already happened (Trail
// entries, a reached Milestone) with what's coming up (a Space's own
// due date, a Milestone's still-open target date) -- past days read as
// a small log, days at or after today read as a small forecast.
// A Milestone/Session week-item's own project suffix, e.g. " (Ship the redesign)" -- shared
// so the four item kinds below stay consistent rather than each formatting it separately.
function projectSuffix(projectName) {
  return projectName ? ` (${projectName})` : '';
}

// A Milestone/Session week-item carries its own block id (see
// getWeekCalendar), so it can deep-link straight to that entry rather
// than just the Space -- a Trail item or a due-date item has no single
// block behind it (Trail is Skeleton-wide, a due date is a Space's own
// field), so those fall back to a plain Space link.
function spaceLink(item) {
  return item.blockId ? `/spaces/${item.spaceId}?highlight=${item.blockId}` : `/spaces/${item.spaceId}`;
}

function WeekCalendarDigest({ days, onDataChanged }) {
  const { confirm } = useConfirmDialog();
  const [reviewMessage, setReviewMessage] = useState(null);
  const hasAnything = days.some(
    (day) => day.trail.length + day.dueSpaces.length + day.milestones.length + day.sessions.length > 0
  );
  if (!hasAnything) return null;

  // Marking a Milestone reached or stopping a running Session right
  // from the calendar cell -- the same mutation the Milestone/Session
  // Tool itself would make (updateBlockContent with the whole content
  // object, reached/reachedAt or endedAt/durationMinutes set the same
  // way MilestoneBlock.jsx/SessionBlock.jsx do it), just reachable
  // without leaving the Dashboard first.
  async function markMilestoneReached(milestone) {
    await updateBlockContent(milestone.id, { ...milestone.content, reached: true, reachedAt: todayString() });
    onDataChanged();
  }

  async function stopSession(session) {
    const endedAt = new Date().toISOString();
    const minutes = Math.max(0, Math.round((new Date(endedAt) - new Date(session.content.startedAt)) / 60000));
    await updateBlockContent(session.id, { ...session.content, endedAt, durationMinutes: minutes });
    onDataChanged();
  }

  // A bulk "close out the week" action -- one Review per Space that
  // was genuinely active (see computeActiveSpaceIds), reusing the
  // existing per-Space createReview API rather than any new endpoint.
  async function handleReviewWeek() {
    const activeIds = computeActiveSpaceIds(days);
    if (activeIds.size === 0) return;
    const confirmed = await confirm(
      `Log a Review for ${activeIds.size} Space${activeIds.size === 1 ? '' : 's'} active this week?`
    );
    if (!confirmed) return;
    for (const spaceId of activeIds) {
      await createReview(spaceId);
    }
    setReviewMessage(`Logged ${activeIds.size} Review${activeIds.size === 1 ? '' : 's'}.`);
    onDataChanged();
  }

  const activeSpaceCount = computeActiveSpaceIds(days).size;

  return (
    <details className="digest digest-week" data-digest="week" open>
      <summary>
        <span className="digest-icon">◷</span>This week ({formatShort(days[0].date)} &ndash; {formatShort(days[6].date)})
      </summary>
      {activeSpaceCount > 0 && (
        <p className="week-review-row">
          <button type="button" className="week-review-btn" onClick={handleReviewWeek}>
            📋 Review this week ({activeSpaceCount} Space{activeSpaceCount === 1 ? '' : 's'})
          </button>
          {reviewMessage && <span className="week-review-message">{reviewMessage}</span>}
        </p>
      )}
      <div className="week-grid">
        {days.map((day, index) => {
          const pastItems = [
            ...day.trail.map((entry) => ({
              key: `trail-${entry.id}`,
              spaceId: entry.space_id,
              spaceTitle: entry.spaceTitle,
              text: entry.summary,
            })),
            ...day.milestones
              .filter((m) => m.reached)
              .map((m, i) => ({
                key: `reached-${index}-${i}`,
                spaceId: m.spaceId,
                spaceTitle: m.spaceTitle,
                blockId: m.id,
                text: `reached: ${m.label}${projectSuffix(m.projectName)}`,
              })),
            ...day.sessions
              .filter((s) => !s.isRunning)
              .map((s, i) => ({
                key: `session-${index}-${i}`,
                spaceId: s.spaceId,
                spaceTitle: s.spaceTitle,
                blockId: s.id,
                text: `logged ${s.durationMinutes ?? '?'} min${s.label ? `: ${s.label}` : ''}${projectSuffix(s.projectName)}`,
              })),
          ];
          const upcomingItems = [
            ...day.dueSpaces.map((space) => ({
              key: `due-${space.spaceId}`,
              spaceId: space.spaceId,
              spaceTitle: space.spaceTitle,
              text: 'due',
            })),
            ...day.milestones
              .filter((m) => !m.reached)
              .map((m, i) => ({
                key: `target-${index}-${i}`,
                spaceId: m.spaceId,
                spaceTitle: m.spaceTitle,
                blockId: m.id,
                text: `target: ${m.label}${projectSuffix(m.projectName)}`,
                action: { label: 'Mark reached', onClick: () => markMilestoneReached(m) },
              })),
            ...day.sessions
              .filter((s) => s.isRunning)
              .map((s, i) => ({
                key: `running-${index}-${i}`,
                spaceId: s.spaceId,
                spaceTitle: s.spaceTitle,
                blockId: s.id,
                text: `session running${s.label ? `: ${s.label}` : ''}${projectSuffix(s.projectName)}`,
                action: { label: 'Stop', onClick: () => stopSession(s) },
              })),
          ];
          return (
            <div key={day.date} className="week-day" data-today={day.isToday ? '' : undefined}>
              <div className="week-day-header">
                <span className="week-day-name">{DAY_LABELS[index]}</span>
                <span className="week-day-num">{parseLocalDate(day.date).getDate()}</span>
              </div>
              {pastItems.length === 0 && upcomingItems.length === 0 && (
                <p className="week-day-empty">&mdash;</p>
              )}
              {[...pastItems, ...upcomingItems].length > 0 && (
                <ul>
                  {pastItems.map((item) => (
                    <li key={item.key} className="week-item week-item-past">
                      <Link to={spaceLink(item)}>{item.spaceTitle}</Link>: {item.text}
                    </li>
                  ))}
                  {upcomingItems.map((item) => (
                    <li key={item.key} className="week-item week-item-upcoming">
                      <Link to={spaceLink(item)}>{item.spaceTitle}</Link>: {item.text}
                      {item.action && (
                        <button type="button" className="week-item-action" onClick={item.action.onClick}>
                          {item.action.label}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </details>
  );
}

function ResurfaceSuggestion({ space }) {
  if (!space) return null;
  return (
    <details className="digest" data-digest="resurface" open>
      <summary>
        <span className="digest-icon">↺</span>Maybe revisit...
      </summary>
      <p>
        <Link to={`/spaces/${space.id}`}>{space.title}</Link> ({space.status}, last touched{' '}
        {formatDate(space.updated_at)})
      </p>
    </details>
  );
}

// "A Resource is just a Space tagged accordingly" (CLAUDE.md) -- this
// reads the same tags-on-a-Space query any other category could use,
// filtered to the one tag "resource" happens to use.
function ResourcesDigest({ spaces }) {
  if (spaces.length === 0) return null;
  return (
    <details className="digest" data-digest="resources" open>
      <summary>
        <span className="digest-icon">⇣</span>Resources
      </summary>
      <ul>
        {spaces.map((space) => (
          <li key={space.id}>
            <Link to={`/spaces/${space.id}`}>{space.title}</Link>
            {/* A promoted Synthesis carries the "resource" tag too, so
                it shows up here alongside ordinary external Resources
                -- this distinguishes the two at a glance rather than
                letting a produced piece read as something sourced. */}
            {space.origin === 'internal' && (
              <span className="origin-badge-small" title="Produced by the app itself, promoted from a Synthesis">
                Internal
              </span>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

// Same pattern as ResourcesDigest above, filtered to the "synthesis"
// tag instead -- a Synthesis is just a Space tagged accordingly, same
// as a Resource is.
function SynthesesDigest({ spaces }) {
  if (spaces.length === 0) return null;
  return (
    <details className="digest" data-digest="syntheses" open>
      <summary>
        <span className="digest-icon">⇡</span>Syntheses
      </summary>
      <ul>
        {spaces.map((space) => (
          <li key={space.id}>
            <Link to={`/spaces/${space.id}`}>{space.title}</Link>
            {space.tags.includes('resource') && (
              <span className="origin-badge-small" title="Promoted to Resource status">
                ↑ Resource
              </span>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

function Dashboard() {
  usePageTitle('Dashboard');
  const { promptToMatch } = useConfirmDialog();
  const [spaces, setSpaces] = useState(null);
  const [overdue, setOverdue] = useState([]);
  const [weekDays, setWeekDays] = useState([]);
  const [resurface, setResurface] = useState(null);
  const [resources, setResources] = useState([]);
  const [syntheses, setSyntheses] = useState([]);
  const [error, setError] = useState(null);
  // Search/status are view-only, not persisted -- narrowing which
  // Spaces show up in the list below, same "zoom in without hiding
  // anything permanently" principle the Category filter strip already
  // established on the Space page.
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(null);

  function refetchSpaces() {
    getSpaces().then(setSpaces).catch((err) => setError(err.message));
  }

  function refetchWeek() {
    getWeekCalendar().then(setWeekDays).catch(() => {});
  }

  useEffect(() => {
    refetchSpaces();
    getOverdueReviews().then(setOverdue).catch(() => {});
    refetchWeek();
    getResurfaceSuggestion().then(setResurface).catch(() => {});
    getSpacesByTag('resource').then(setResources).catch(() => {});
    getSpacesByTag('synthesis').then(setSyntheses).catch(() => {});
  }, []);

  // Same heavier, type-the-name confirmation as the Delete control on
  // the Space page itself -- this is the one place a Space can vanish
  // for good, so it should never be a single misclick away.
  async function handleDeleteSpace(space) {
    const confirmed = await promptToMatch(
      `Delete "${space.title}" and everything in it? This cannot be undone.`,
      space.title
    );
    if (!confirmed) return;
    await deleteSpace(space.id);
    refetchSpaces();
  }

  return (
    <div className="app-shell">
      <Sidebar current="dashboard" />
      <main className="app-content">

      <h1>Dashboard</h1>
      {/* A coherence audit found six different pages answering "what's
          going on" (this one, Insights, the Log, a Space's own Trail,
          Review, and on-demand Reports) with no page ever saying how it
          relates to the others -- that hierarchy only existed in
          CLAUDE.md's own Roadmap prose. This line, and the matching ones
          on Insights/the Log/Trail, are the fix: each names what it is
          and points at its two nearest neighbors, in a closed loop
          rather than every page just describing itself in isolation. */}
      <p>
        Where you land -- create Spaces, see what needs attention, and browse everything you've
        built. For trends across all of it, see Insights; for the complete history, see the Log.
      </p>

      <p className="dashboard-create-row">
        <Link to="/spaces/new" className="new-space-btn">
          + New Space
        </Link>
        <Link to="/resources/new" className="new-space-btn new-resource-btn">
          + New Resource
        </Link>
        <Link to="/synthesis/new" className="new-space-btn new-resource-btn">
          + New Synthesis
        </Link>
      </p>

      {/* The one thing on this page meant to actually stand out --
          "see trends/metrics/insights across Spaces" was the Dashboard's
          founding idea, and this is the real version of it, not another
          digest in the stack below. */}
      <Link to="/insights" className="insights-banner">
        <span className="insights-banner-title">Insights</span>
        <span className="insights-banner-sub">
          Aggregate trends across every Space -- Work Types, themes, activity, provenance.
        </span>
      </Link>

      <OverdueReviews items={overdue} />
      <WeekCalendarDigest days={weekDays} onDataChanged={refetchWeek} />
      <ResurfaceSuggestion space={resurface} />
      <ResourcesDigest spaces={resources} />
      <SynthesesDigest spaces={syntheses} />

      {error && <p>Could not load spaces: {error}</p>}

      {!error && spaces === null && <p>Loading spaces...</p>}

      {spaces && spaces.length === 0 && (
        <p>No spaces yet. Create your first one to get started.</p>
      )}

      {spaces && spaces.length > 0 && (() => {
        // Matches the current search text only, independent of whatever
        // status tab happens to be active -- this is what each tab's own
        // count reflects ("if I click this, how many would show"), not a
        // count compounded by the currently-active filter.
        const searchMatches = spaces.filter((space) =>
          space.title.toLowerCase().includes(search.trim().toLowerCase())
        );
        const visibleSpaces = searchMatches.filter(
          (space) => !statusFilter || space.status === statusFilter
        );
        return (
          <>
            <p className="space-search-row">
              <input
                type="text"
                value={search}
                placeholder="Search Spaces by title..."
                className="space-search-input"
                onChange={(event) => setSearch(event.target.value)}
              />
              <span
                className={`category-filter-tab${statusFilter === null ? ' category-filter-tab-active' : ''}`}
                onClick={() => setStatusFilter(null)}
              >
                All ({searchMatches.length})
              </span>
              {SPACE_STATUSES.map((status) => (
                <span
                  key={status}
                  className={`category-filter-tab${statusFilter === status ? ' category-filter-tab-active' : ''}`}
                  onClick={() => setStatusFilter(statusFilter === status ? null : status)}
                >
                  {status} ({searchMatches.filter((space) => space.status === status).length})
                </span>
              ))}
            </p>
            {visibleSpaces.length === 0 && <p>No Spaces match &ldquo;{search}&rdquo;.</p>}
            {visibleSpaces.length > 0 && (
              <ul className="space-list">
                {visibleSpaces.map((space) => (
                  <li key={space.id} className="space-card">
                    <SpaceGlyph space={space} size={30} />
                    <div className="space-main">
                      <div className="space-title">
                        <Link to={`/spaces/${space.id}`}>{space.title}</Link>
                        {space.isTestSpace && (
                          <span className="test-flag" title="Scratch area, not real content">
                            TEST SPACE
                          </span>
                        )}
                      </div>
                      <div className="space-meta">
                        <span className="status-pill" data-status={space.status}>
                          {space.status}
                        </span>
                        <span className="sep">·</span>
                        <span>updated {formatDate(space.updated_at)}</span>
                        {space.due_date && (
                          <>
                            <span className="sep">·</span>
                            <span className={space.isOverdue ? 'due-date-overdue' : undefined}>
                              due {space.due_date}
                            </span>
                            {space.isOverdue && <span className="overdue-badge">Overdue</span>}
                          </>
                        )}
                        {space.tags.length > 0 && (
                          <>
                            <span className="sep">·</span>
                            {space.tags.map((tag) => (
                              <span key={tag} className="tag-chip">
                                {tag}
                              </span>
                            ))}
                          </>
                        )}
                      </div>
                    </div>
                    {!space.isTestSpace && (
                      <button
                        type="button"
                        className="btn-ghost-small"
                        onClick={() => handleDeleteSpace(space)}
                      >
                        Delete
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        );
      })()}
      </main>
    </div>
  );
}

export default Dashboard;
