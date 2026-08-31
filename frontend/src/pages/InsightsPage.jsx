// Insights: the fuller version of "see trends/metrics/insights across
// [Spaces]" that was in the Dashboard's original vision from the start
// (see CLAUDE.md). Four sections, each reading straight off its own
// query function in backend/src/db/queries.js via one combined
// GET /insights call -- nothing here is computed client-side.
//
// Deliberately its own dedicated page rather than more Dashboard
// digests: there's real depth in each section, and the person asked
// for this to be made prominent, since surfacing "what's actually
// going on" across every Space was fundamentally what building this
// app was for.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getInsights } from '../api.js';
import { blockRegistry } from '../registry/blocks.js';
import TopNav from '../components/TopNav.jsx';
import { usePageTitle } from '../hooks/usePageTitle.js';

function labelFor(workType) {
  return blockRegistry[workType]?.label || workType;
}

// A small, reusable horizontal bar row -- same "width as a percentage
// of the running max" idea as ProgressView's .progress-track/.progress-fill,
// just one row per category instead of one bar for a single ratio.
function BarRow({ label, count, max }) {
  const pct = max === 0 ? 0 : Math.round((count / max) * 100);
  return (
    <div className="insight-bar-row">
      <span className="insight-bar-label">{label}</span>
      <div className="progress-track insight-bar-track">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="insight-bar-count">{count}</span>
    </div>
  );
}

function WorkMixSection({ workMix }) {
  const maxType = Math.max(1, ...workMix.byType.map((row) => row.count));
  const maxConfidence = Math.max(1, ...workMix.byConfidence.map((row) => row.count));
  return (
    <section className="insight-section">
      <h2>Work Type &amp; confidence mix</h2>
      <p className="insight-section-sub">
        {workMix.total} Work items across every Space -- what kind of thinking is actually
        happening, and how settled it feels.
      </p>
      {workMix.total === 0 && <p className="insight-empty">No Work items yet.</p>}
      {workMix.total > 0 && (
        <div className="insight-columns">
          <div>
            <h3>By type</h3>
            {workMix.byType
              .filter((row) => row.count > 0)
              .map((row) => (
                <BarRow key={row.type} label={labelFor(row.type)} count={row.count} max={maxType} />
              ))}
          </div>
          <div>
            <h3>By confidence</h3>
            {workMix.byConfidence.map((row) => (
              <BarRow key={row.level} label={row.level} count={row.count} max={maxConfidence} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function ThemesSection({ themes }) {
  return (
    <section className="insight-section">
      <h2>Themes &amp; unresolved tensions</h2>
      <p className="insight-section-sub">
        A Category recurring across unrelated Spaces is a real cross-cutting theme; a Tension is
        an open conflict in your own reasoning.
      </p>
      <div className="insight-columns">
        <div>
          <h3>Recurring Categories</h3>
          {themes.recurringCategories.length === 0 && (
            <p className="insight-empty">No Category name is shared across more than one Space yet.</p>
          )}
          {themes.recurringCategories.length > 0 && (
            <ul className="insight-plain-list">
              {themes.recurringCategories.map((cat) => (
                <li key={cat.name}>
                  <span className="tag-chip">{cat.name}</span> in {cat.spaceCount} Spaces
                  <span className="insight-detail"> -- {cat.spaceTitles.join(', ')}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3>Open Tensions ({themes.openTensionCount})</h3>
          {themes.openTensions.length === 0 && <p className="insight-empty">No open Tensions right now.</p>}
          {themes.openTensions.length > 0 && (
            <ul className="insight-plain-list">
              {themes.openTensions.map((tension, i) => (
                <li key={i}>
                  <Link to={`/spaces/${tension.spaceId}`}>{tension.spaceTitle}</Link>: {tension.label}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function ActivitySection({ activity }) {
  const maxWeek = Math.max(1, ...activity.weeklyCounts.map((row) => row.count));
  return (
    <section className="insight-section">
      <h2>Activity &amp; staleness</h2>
      <p className="insight-section-sub">
        Whether thinking is actually moving week to week, and which Spaces have gone quiet long
        enough to be worth a second look, regardless of their status.
      </p>
      <div className="insight-columns">
        <div>
          <h3>Weekly activity</h3>
          {activity.weeklyCounts.length === 0 && <p className="insight-empty">No activity recorded yet.</p>}
          {activity.weeklyCounts.length > 0 &&
            activity.weeklyCounts.map((row) => (
              <BarRow key={row.week} label={row.week} count={row.count} max={maxWeek} />
            ))}
        </div>
        <div>
          <h3>Stale Spaces ({activity.staleThresholdDays}+ days untouched)</h3>
          {activity.staleSpaces.length === 0 && <p className="insight-empty">Nothing has gone stale.</p>}
          {activity.staleSpaces.length > 0 && (
            <ul className="insight-plain-list">
              {activity.staleSpaces.map((space) => (
                <li key={space.id}>
                  <Link to={`/spaces/${space.id}`}>{space.title}</Link>
                  <span className="insight-detail"> -- {space.daysSinceUpdate} days</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function ProvenanceSection({ provenance }) {
  const maxOrigin = Math.max(1, provenance.byOrigin.external, provenance.byOrigin.internal, provenance.byOrigin.none);
  return (
    <section className="insight-section">
      <h2>Provenance &amp; Synthesis yield</h2>
      <p className="insight-section-sub">
        How much of what exists was brought in versus produced by the app itself, and how much raw
        thinking has actually been distilled into a finished piece.
      </p>
      <div className="insight-columns">
        <div>
          <h3>Where Spaces came from</h3>
          <BarRow label="External" count={provenance.byOrigin.external} max={maxOrigin} />
          <BarRow label="Internal" count={provenance.byOrigin.internal} max={maxOrigin} />
          <BarRow label="Unmarked" count={provenance.byOrigin.none} max={maxOrigin} />
        </div>
        <div>
          <h3>Work &rarr; Synthesis &rarr; Resource</h3>
          <p className="insight-funnel">
            <span className="insight-funnel-number">{provenance.workItemCount}</span> Work items
          </p>
          <p className="insight-funnel">
            <span className="insight-funnel-number">{provenance.synthesisCount}</span> compiled into a Synthesis
          </p>
          <p className="insight-funnel">
            <span className="insight-funnel-number">{provenance.promotedCount}</span> promoted to Resource status
          </p>
        </div>
      </div>
    </section>
  );
}

// The Time arc's own facet -- the arc's final, cross-cutting layer,
// pulling due dates, Milestones, Sessions, and Review into one place
// now that all four exist to have something worth summing up.
function TimeSection({ time }) {
  const hasDueDates = time.dueDates.overdue.length > 0 || time.dueDates.upcoming.length > 0;
  const hasReviewGaps = time.review.neverReviewed.length > 0 || time.review.staleReviews.length > 0;

  return (
    <section className="insight-section">
      <h2>Time</h2>
      <p className="insight-section-sub">
        Due dates, Milestones, Sessions, and Review, threaded together -- what's coming up, what's
        overdue, and how much has actually been logged.
      </p>
      <div className="insight-columns">
        <div>
          <h3>Due dates</h3>
          {!hasDueDates && <p className="insight-empty">No Space has a due date set.</p>}
          {time.dueDates.overdue.length > 0 && (
            <ul className="insight-plain-list">
              {time.dueDates.overdue.map((space) => (
                <li key={space.id}>
                  <Link to={`/spaces/${space.id}`}>{space.title}</Link>
                  <span className="insight-detail"> -- overdue since {space.due_date}</span>
                </li>
              ))}
            </ul>
          )}
          {time.dueDates.upcoming.length > 0 && (
            <ul className="insight-plain-list">
              {time.dueDates.upcoming.map((space) => (
                <li key={space.id}>
                  <Link to={`/spaces/${space.id}`}>{space.title}</Link>
                  <span className="insight-detail"> -- due {space.due_date}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3>Milestones</h3>
          {time.milestones.total === 0 && <p className="insight-empty">No Milestones yet.</p>}
          {time.milestones.total > 0 && (
            <p className="insight-funnel">
              <span className="insight-funnel-number">{time.milestones.reachedCount}</span> of{' '}
              {time.milestones.total} reached
            </p>
          )}
          {time.milestones.overdueMilestones.length === 0 ? (
            time.milestones.total > 0 && <p className="insight-empty">No overdue Milestones.</p>
          ) : (
            <ul className="insight-plain-list">
              {time.milestones.overdueMilestones.map((milestone, index) => (
                <li key={index}>
                  <Link to={`/spaces/${milestone.spaceId}`}>{milestone.spaceTitle}</Link>: {milestone.label}
                  <span className="insight-detail"> -- target {milestone.targetDate}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="insight-columns">
        <div>
          <h3>Sessions</h3>
          {time.sessions.completedCount === 0 ? (
            <p className="insight-empty">No completed Sessions yet.</p>
          ) : (
            <p className="insight-funnel">
              <span className="insight-funnel-number">{time.sessions.totalMinutesLogged}</span> minutes logged across{' '}
              {time.sessions.completedCount} session{time.sessions.completedCount === 1 ? '' : 's'}
            </p>
          )}
          {time.sessions.runningCount > 0 && (
            <p className="insight-empty">
              {time.sessions.runningCount} session{time.sessions.runningCount === 1 ? '' : 's'} currently running.
            </p>
          )}
        </div>
        <div>
          <h3>Review ({time.review.reviewStaleThresholdDays}+ days since last)</h3>
          {!hasReviewGaps && <p className="insight-empty">Every Space is either freshly reviewed or has nothing to review yet.</p>}
          {time.review.neverReviewed.length > 0 && (
            <ul className="insight-plain-list">
              {time.review.neverReviewed.map((space) => (
                <li key={space.id}>
                  <Link to={`/spaces/${space.id}`}>{space.title}</Link>
                  <span className="insight-detail"> -- never reviewed</span>
                </li>
              ))}
            </ul>
          )}
          {time.review.staleReviews.length > 0 && (
            <ul className="insight-plain-list">
              {time.review.staleReviews.map((space) => (
                <li key={space.id}>
                  <Link to={`/spaces/${space.id}`}>{space.title}</Link>
                  <span className="insight-detail"> -- {space.days_since} days since last review</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function InsightsPage() {
  usePageTitle('Insights');
  const [insights, setInsights] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getInsights().then(setInsights).catch((err) => setError(err.message));
  }, []);

  return (
    <main>
      <TopNav current="insights" />
      <h1>Insights</h1>
      <p>What's actually going on across every Space -- the thinking, not just the record of it.</p>

      {error && <p>Could not load Insights: {error}</p>}
      {!error && !insights && <p>Loading...</p>}

      {insights && (
        <div className="insights-page">
          <WorkMixSection workMix={insights.workMix} />
          <ThemesSection themes={insights.themes} />
          <ActivitySection activity={insights.activity} />
          <ProvenanceSection provenance={insights.provenance} />
          <TimeSection time={insights.time} />
        </div>
      )}
    </main>
  );
}

export default InsightsPage;
