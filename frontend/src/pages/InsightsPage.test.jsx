import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import InsightsPage from './InsightsPage.jsx';
import * as api from '../api.js';

vi.mock('../api.js');

function renderPage() {
  return render(
    <MemoryRouter>
      <InsightsPage />
    </MemoryRouter>
  );
}

function makeInsights(overrides = {}) {
  return {
    workMix: { total: 0, byType: [], byConfidence: [] },
    themes: { recurringCategories: [], openTensionCount: 0, openTensions: [] },
    activity: { weeklyCounts: [], staleThresholdDays: 30, staleSpaces: [] },
    provenance: { byOrigin: { external: 0, internal: 0, none: 0 }, workItemCount: 0, synthesisCount: 0, promotedCount: 0 },
    time: {
      dueDates: { overdue: [], upcoming: [] },
      milestones: { total: 0, reachedCount: 0, overdueMilestones: [] },
      sessions: { completedCount: 0, totalMinutesLogged: 0, runningCount: 0 },
      review: { reviewStaleThresholdDays: 14, neverReviewed: [], staleReviews: [] },
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('InsightsPage: loading and errors', () => {
  it('shows a loading state, then every section once fetched', async () => {
    api.getInsights.mockResolvedValue(makeInsights());
    renderPage();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: /Work Type/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Themes/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Activity/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Provenance/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Time' })).toBeInTheDocument();
  });

  it('shows an error when the fetch fails', async () => {
    api.getInsights.mockRejectedValue(new Error('Broken'));
    renderPage();
    expect(await screen.findByText('Could not load Insights: Broken')).toBeInTheDocument();
  });
});

describe('InsightsPage: interpretive readings', () => {
  it('renders each section\'s computed reading when present', async () => {
    api.getInsights.mockResolvedValue(
      makeInsights({
        workMix: { total: 1, byType: [{ type: 'assessment', count: 1 }], byConfidence: [], reading: 'Assessment leads.' },
        themes: { recurringCategories: [], openTensionCount: 0, openTensions: [], reading: 'Risk cuts across two Spaces.' },
        activity: { weeklyCounts: [], staleThresholdDays: 30, staleSpaces: [], reading: 'Activity picked up this week.' },
        provenance: {
          byOrigin: { external: 1, internal: 0, none: 0 },
          workItemCount: 0,
          synthesisCount: 0,
          promotedCount: 0,
          reading: 'Most of what\'s here was brought in from outside.',
        },
        time: {
          dueDates: { overdue: [], upcoming: [] },
          milestones: { total: 0, reachedCount: 0, overdueMilestones: [] },
          sessions: { completedCount: 0, totalMinutesLogged: 0, runningCount: 0 },
          review: { reviewStaleThresholdDays: 14, neverReviewed: [], staleReviews: [] },
          reading: '1 thing is overdue.',
        },
      })
    );
    renderPage();
    expect(await screen.findByText('Assessment leads.')).toBeInTheDocument();
    expect(screen.getByText('Risk cuts across two Spaces.')).toBeInTheDocument();
    expect(screen.getByText('Activity picked up this week.')).toBeInTheDocument();
    expect(screen.getByText('Most of what\'s here was brought in from outside.')).toBeInTheDocument();
    expect(screen.getByText('1 thing is overdue.')).toBeInTheDocument();
    expect(document.querySelectorAll('.insight-reading')).toHaveLength(5);
  });

  it('renders no reading callouts when every facet\'s reading is null', async () => {
    api.getInsights.mockResolvedValue(makeInsights());
    renderPage();
    await screen.findByText('No Work items yet.');
    expect(document.querySelectorAll('.insight-reading')).toHaveLength(0);
  });
});

describe('InsightsPage: Work mix', () => {
  it('shows an empty state when there are no Work items', async () => {
    api.getInsights.mockResolvedValue(makeInsights());
    renderPage();
    expect(await screen.findByText('No Work items yet.')).toBeInTheDocument();
  });

  it('renders a bar row per non-zero type and every confidence level', async () => {
    api.getInsights.mockResolvedValue(
      makeInsights({
        workMix: {
          total: 3,
          byType: [{ type: 'assessment', count: 3 }, { type: 'question', count: 0 }],
          byConfidence: [{ level: 'solid', count: 3 }],
        },
      })
    );
    renderPage();
    expect(await screen.findByText('Assessment')).toBeInTheDocument();
    expect(screen.queryByText('Question')).not.toBeInTheDocument();
    expect(screen.getByText('solid')).toBeInTheDocument();
  });
});

describe('InsightsPage: Themes', () => {
  it('shows recurring Categories and open Tensions when present', async () => {
    api.getInsights.mockResolvedValue(
      makeInsights({
        themes: {
          recurringCategories: [{ name: 'Risk', spaceCount: 2, spaceTitles: ['Space A', 'Space B'] }],
          openTensionCount: 1,
          openTensions: [{ spaceId: 'sp-1', spaceTitle: 'Space A', label: 'Conflicting claims' }],
        },
      })
    );
    renderPage();
    expect(await screen.findByText('Risk')).toBeInTheDocument();
    expect(screen.getByText(/Space A, Space B/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Open Tensions (1)' })).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Space A' });
    expect(link).toHaveAttribute('href', '/spaces/sp-1');
  });
});

describe('InsightsPage: Activity & staleness', () => {
  it('shows stale Spaces with days since update', async () => {
    api.getInsights.mockResolvedValue(
      makeInsights({
        activity: {
          weeklyCounts: [{ week: '2024-W20', count: 4 }],
          staleThresholdDays: 30,
          staleSpaces: [{ id: 'sp-2', title: 'Forgotten', daysSinceUpdate: 45 }],
        },
      })
    );
    renderPage();
    expect(await screen.findByText('Forgotten')).toBeInTheDocument();
    expect(screen.getByText(/45 days/)).toBeInTheDocument();
  });
});

describe('InsightsPage: Provenance funnel', () => {
  it('shows the Work -> Synthesis -> Resource funnel numbers', async () => {
    api.getInsights.mockResolvedValue(
      makeInsights({ provenance: { byOrigin: { external: 2, internal: 1, none: 3 }, workItemCount: 10, synthesisCount: 4, promotedCount: 1 } })
    );
    renderPage();
    await screen.findByRole('heading', { name: /Provenance/ });
    const funnelNumbers = [...document.querySelectorAll('.insight-funnel-number')].map((el) => el.textContent);
    expect(funnelNumbers).toEqual(['10', '4', '1']);
  });
});

describe('InsightsPage: Time', () => {
  it('shows overdue/upcoming due dates, Milestones, Sessions, and Review gaps', async () => {
    api.getInsights.mockResolvedValue(
      makeInsights({
        time: {
          dueDates: {
            overdue: [{ id: 'sp-3', title: 'Late Space', due_date: '2020-01-01' }],
            upcoming: [{ id: 'sp-4', title: 'Soon Space', due_date: '2030-01-01' }],
          },
          milestones: { total: 2, reachedCount: 1, overdueMilestones: [{ spaceId: 'sp-5', spaceTitle: 'M Space', label: 'Ship v1', targetDate: '2020-01-01' }] },
          sessions: { completedCount: 2, totalMinutesLogged: 90, runningCount: 1 },
          review: { reviewStaleThresholdDays: 14, neverReviewed: [{ id: 'sp-6', title: 'Unreviewed' }], staleReviews: [{ id: 'sp-7', title: 'Stale Review', days_since: 20 }] },
        },
      })
    );
    renderPage();
    expect(await screen.findByText('Late Space')).toBeInTheDocument();
    expect(screen.getByText('Soon Space')).toBeInTheDocument();

    // These lines mix plain text with nested <span>s, so RTL's default
    // getByText (which only matches a single text node) can't find them --
    // check the containing element's full textContent instead.
    const funnelParagraphs = [...document.querySelectorAll('.insight-funnel')].map((el) => el.textContent);
    expect(funnelParagraphs).toContain('1 of 2 reached');
    expect(funnelParagraphs).toContain('90 minutes logged across 2 sessions');

    expect(screen.getByText('Ship v1', { exact: false })).toBeInTheDocument();
    const emptyNotes = [...document.querySelectorAll('.insight-empty')].map((el) => el.textContent);
    expect(emptyNotes).toContain('1 session currently running.');
    expect(screen.getByText('Unreviewed')).toBeInTheDocument();
    expect(screen.getByText('Stale Review')).toBeInTheDocument();
  });

  it('shows empty-state messages when nothing Time-related exists yet', async () => {
    api.getInsights.mockResolvedValue(makeInsights());
    renderPage();
    expect(await screen.findByText('No Space has a due date set.')).toBeInTheDocument();
    expect(screen.getByText('No Milestones yet.')).toBeInTheDocument();
    expect(screen.getByText('No completed Sessions yet.')).toBeInTheDocument();
    expect(screen.getByText('Every Space is either freshly reviewed or has nothing to review yet.')).toBeInTheDocument();
  });
});
