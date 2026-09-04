// A compact, always-reachable key explaining the app's own visual
// language -- the SpaceGlyph's computed shape, the family colors a
// Tool's left-border stripe carries, and where to find the full icon
// glossary. The cohesion-pass audit found this had no answer anywhere:
// a sighted user could hover a glyph for its own one-off description
// (see SpaceGlyph.jsx's <title>), but nothing explained the *system* in
// general, which is exactly what's hardest to reconstruct mid-demo when
// walking someone else through the app.
//
// Deliberately built from the real, live SpaceGlyph component rather
// than a drawn diagram -- each row below is an actual glyph rendered
// with synthetic-but-real props, so the legend can never drift out of
// sync with what the glyph actually draws.

import { Link } from 'react-router-dom';
import SpaceGlyph from '../glyph/SpaceGlyph.jsx';
import { defaultBlockTheme } from '../theme/itemTheme.js';
import { useEscapeKey } from '../hooks/useEscapeKey.js';

const GLYPH_ROWS = [
  {
    space: { id: 'legend-1', status: 'inactive', relationDensity: 0, openTensionCount: 0, milestoneStats: { reached: 0, total: 0 } },
    text: 'More filled in (darker, thicker lines, solid tips) means further along the scale: dormant, inactive, active, interesting, mature.',
  },
  {
    space: { id: 'legend-2', status: 'active', relationDensity: 4, openTensionCount: 0, milestoneStats: { reached: 0, total: 0 } },
    text: 'Branches are References -- how many other Spaces this one connects to.',
  },
  {
    space: { id: 'legend-3', status: 'active', relationDensity: 2, openTensionCount: 2, milestoneStats: { reached: 0, total: 0 } },
    text: 'A crack through the trunk means open Tensions -- more segments, more of them.',
  },
  {
    space: { id: 'legend-4', status: 'active', relationDensity: 2, openTensionCount: 0, isOverdue: true, milestoneStats: { reached: 0, total: 0 } },
    text: 'A dashed trunk (instead of solid) means the Space is overdue.',
  },
  {
    space: { id: 'legend-5', status: 'active', relationDensity: 2, openTensionCount: 0, milestoneStats: { reached: 2, total: 4 } },
    text: 'A column of small rings tracks Milestones, filled in from the bottom as each is reached.',
  },
  {
    space: {
      id: 'legend-6',
      status: 'active',
      relationDensity: 2,
      openTensionCount: 0,
      milestoneStats: { reached: 0, total: 0 },
      theme: { accent: 'teal' },
    },
    text: 'The color is yours -- whatever you themed this Space to (see "Look" on any Space page). The shape stays computed, so personalizing never hides what the glyph is reporting.',
  },
];

// The three families, shown with the accent each one's Tools default
// into -- pulled from the real defaults (see theme/itemTheme.js) rather
// than restated here, so this can't drift from what actually renders.
const FAMILY_ROWS = [
  {
    accent: defaultBlockTheme('text').accent,
    label: 'General',
    text: 'Everyday building blocks -- Writing, List, Reference, Media, Comparison.',
  },
  {
    accent: defaultBlockTheme('assessment').accent,
    label: 'Work',
    text: 'The individual acts of thinking -- Assessment, Question, Hypothesis, and the rest.',
  },
  {
    accent: defaultBlockTheme('milestone').accent,
    label: 'Time',
    text: 'Due dates, Milestones, Sessions -- anything to do with when.',
  },
  {
    accent: defaultBlockTheme('conceptMap').accent,
    label: 'Mapping',
    text: 'Structure and relation rather than a single claim -- Word Evolution, Concept Map, Model.',
  },
];

function Legend({ onClose }) {
  useEscapeKey(onClose);

  return (
    <div className="legend-overlay" onClick={onClose}>
      <div className="legend-panel" role="dialog" aria-label="How to read this app" onClick={(event) => event.stopPropagation()}>
        <div className="legend-header">
          <h2>How to read this app</h2>
          <button type="button" className="legend-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        <section>
          <h3>The glyph next to a Space's title</h3>
          <p className="legend-intro">
            Computed live from that Space's own data, every time -- never decorative.
          </p>
          <ul className="legend-glyph-rows">
            {GLYPH_ROWS.map((row, index) => (
              <li key={index}>
                <SpaceGlyph space={row.space} size={28} />
                <span>{row.text}</span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h3>Tool colors</h3>
          <p className="legend-intro">
            Every Tool type has its own distinct default look -- color, shape,
            density and typeface -- so two entries never look alike just
            because you wrote them both. These four are the broad families
            those defaults sit in. Any single Space or Tool can be re-themed by
            hand from its own &ldquo;Theme&rdquo; control.
          </p>
          <ul className="legend-family-rows">
            {FAMILY_ROWS.map((row) => (
              <li key={row.label}>
                <span className="legend-swatch" style={{ background: `var(--theme-accent-${row.accent})` }} />
                <strong>{row.label}</strong> -- {row.text}
              </li>
            ))}
          </ul>
          <p className="legend-intro">
            Every Tool also carries its own icon -- see the full glossary on the{' '}
            <Link to="/tools" onClick={onClose}>
              Tools catalog
            </Link>
            .
          </p>
        </section>
      </div>
    </div>
  );
}

export default Legend;
