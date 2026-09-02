// Visual Identity: a small generated glyph reflecting a Space's actual
// data, not decoration. Per the Tools & Resources doc, originally three
// independent, computed dimensions:
//   - status         -> how "filled in" the glyph looks (opacity,
//                        stroke weight, whether branch tips are solid)
//   - relation density (References in + out) -> how many branches
//     radiate from the trunk
//   - open tension count -> a jagged crack drawn through the trunk
//
// Widened in a later pass to react to two more already-computed pieces
// of state, confirmed via direct question from a short list of
// candidates (the third, Review staleness, was deliberately left out --
// it's true of nearly every Space nearly all the time, per
// getTimeInsights' own reasoning for excluding it from the "needs
// attention" badge, so showing it here would read as permanently
// alarmed rather than a genuine signal):
//   - isOverdue      -> the trunk is drawn dashed instead of solid
//   - Milestone reached ratio -> a column of small rings alongside the
//     trunk (one per Milestone, capped, filled from the bottom up as
//     each is reached) -- offset to the side rather than drawn on the
//     trunk's own centerline so it never visually collides with the
//     crack above, which straddles that same line for tensions.
//
// Branch *angles* are seeded from the Space's id purely so glyphs with
// the same branch count don't all look identical -- that's a rendering
// choice, not a data channel of its own.
//
// The manual layer works differently now. There used to be a hand-picked
// accent mark (star/underline/triangle/dot) drawn on top of the computed
// shape, which turned out to be too thin to be worth having -- it marked
// a Space without meaning anything. It's been absorbed into the real
// personalization system (see theme/itemTheme.js): a Space's chosen
// accent color now colors this whole glyph, so a personalized Space is
// personalized here too, while the *shape* stays purely computed. Color
// is yours; form still reports the data.

// The person's own five words for how they actually think about a
// Space's state, replacing the app's earlier invented four (nascent/
// developing/mature/dormant) -- see migrateSpaceStatuses in
// backend/src/db/queries/spaces.js for how existing rows moved over.
// Ordered as an ascending scale of engagement, which is what the glyph
// draws: fainter and thinner at the dormant end, fully filled in at the
// mature end. `interesting` is the one that isn't purely a stage -- it
// marks a Space worth returning to -- so it gets full opacity like
// mature but keeps a lighter stroke.
const STATUS_STYLE = {
  dormant: { opacity: 0.35, strokeWidth: 1, tipFilled: false, grey: true },
  inactive: { opacity: 0.45, strokeWidth: 1, tipFilled: false, grey: false },
  active: { opacity: 0.75, strokeWidth: 1.3, tipFilled: true, grey: false },
  interesting: { opacity: 1, strokeWidth: 1.3, tipFilled: true, grey: false },
  mature: { opacity: 1, strokeWidth: 1.8, tipFilled: true, grey: false },
};

// The canonical status list and order, for anything that needs to
// cycle or offer all of them (the click-to-cycle status pill on
// SpacePage) -- one place, so it can't drift from what the glyph
// actually renders.
export const SPACE_STATUSES = Object.keys(STATUS_STYLE);

import { resolveSpaceTheme } from '../theme/itemTheme.js';

const MAX_BRANCHES = 6;
const MAX_CRACK_SEGMENTS = 4;
const MAX_MILESTONE_DOTS = 4;

function hashString(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return hash;
}

function seededRandom(seed) {
  let state = seed || 1;
  return () => {
    state = (state * 1103515245 + 12345) >>> 0;
    return (state >>> 8) / 0xffffff;
  };
}

function buildCrackPoints(cx, baseY, forkY, segments, rand) {
  const points = [];
  for (let i = 0; i <= segments + 1; i++) {
    const y = baseY - ((baseY - forkY) * i) / (segments + 1);
    const jitter = (rand() - 0.5) * 3;
    points.push(`${(cx + jitter).toFixed(1)},${y.toFixed(1)}`);
  }
  return points.join(' ');
}

function SpaceGlyph({ space, size = 28 }) {
  const status = space.status || 'active';
  const relationDensity = space.relationDensity || 0;
  const openTensionCount = space.openTensionCount || 0;
  const isOverdue = Boolean(space.isOverdue);
  const milestoneStats = space.milestoneStats || { reached: 0, total: 0 };
  const config = STATUS_STYLE[status] || STATUS_STYLE.active;
  const rand = seededRandom(hashString(space.id));

  const cx = size / 2;
  const baseY = size - 2;
  const forkY = size * 0.55;
  const branchCount = Math.min(relationDensity, MAX_BRANCHES);
  // The glyph draws in this Space's own themed accent (see
  // theme/itemTheme.js), so a personalized Space is personalized here
  // too -- while the *shape* keeps reporting purely computed data, which
  // is the line this component has always held. A dormant Space still
  // falls back to neutral ink regardless of theme: "asleep" reads as
  // colorless no matter what color you picked.
  const accent = resolveSpaceTheme(space).accent;
  const strokeColor = config.grey ? 'var(--ink-faint)' : `var(--theme-accent-${accent})`;

  const branches = [];
  for (let i = 0; i < branchCount; i++) {
    const t = branchCount === 1 ? 0.5 : i / (branchCount - 1);
    const angle = (t - 0.5) * 2.2 + (rand() - 0.5) * 0.4;
    const length = size * (0.28 + rand() * 0.16);
    const startY = forkY - i * size * 0.04;
    const x2 = cx + Math.sin(angle) * length;
    const y2 = Math.max(2, startY - Math.cos(angle) * length);
    branches.push({ x1: cx, y1: startY, x2, y2 });
  }

  const crackSegments = Math.min(openTensionCount, MAX_CRACK_SEGMENTS);

  // A column of small rings alongside the trunk, one per Milestone
  // (capped), filled from the bottom up as each is reached -- offset a
  // few px to the side so it never sits on the same centerline the
  // crack above draws through, even when a Space has both open
  // Tensions and Milestones at once.
  const milestoneDotCount = Math.min(milestoneStats.total, MAX_MILESTONE_DOTS);
  const milestoneDots = [];
  for (let i = 0; i < milestoneDotCount; i++) {
    const y = baseY - ((baseY - forkY) * (i + 0.5)) / milestoneDotCount;
    milestoneDots.push({ x: cx + size * 0.16, y, filled: i < milestoneStats.reached });
  }

  // The same description backs both the accessible name (aria-label,
  // for a screen reader) and a native <title> element -- an SVG
  // <title> is what actually produces a hover tooltip in a mouse-driven
  // browser, which aria-label alone doesn't. Without it, this glyph is
  // "computed from real data, never decorative" per CLAUDE.md, but a
  // sighted user has no way to learn how to actually read it.
  const description = `Visual identity: ${status}, ${relationDensity} connections, ${openTensionCount} open tensions${
    isOverdue ? ', overdue' : ''
  }${milestoneStats.total > 0 ? `, ${milestoneStats.reached}/${milestoneStats.total} milestones reached` : ''}`;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={description}>
      <title>{description}</title>
      <line
        x1={cx}
        y1={baseY}
        x2={cx}
        y2={forkY}
        stroke={strokeColor}
        strokeWidth={config.strokeWidth}
        strokeOpacity={config.opacity}
        strokeLinecap="round"
        strokeDasharray={isOverdue ? '2,1.5' : undefined}
      />
      {milestoneDots.map((dot, index) =>
        dot.filled ? (
          <circle key={index} cx={dot.x} cy={dot.y} r={1.1} fill={strokeColor} fillOpacity={config.opacity} />
        ) : (
          <circle
            key={index}
            cx={dot.x}
            cy={dot.y}
            r={1.1}
            fill="none"
            stroke={strokeColor}
            strokeWidth={0.7}
            strokeOpacity={config.opacity}
          />
        )
      )}
      {branches.map((branch, index) => (
        <g key={index}>
          <line
            x1={branch.x1}
            y1={branch.y1}
            x2={branch.x2}
            y2={branch.y2}
            stroke={strokeColor}
            strokeWidth={config.strokeWidth * 0.8}
            strokeOpacity={config.opacity}
            strokeLinecap="round"
          />
          {config.tipFilled ? (
            <circle cx={branch.x2} cy={branch.y2} r={1.4} fill={strokeColor} fillOpacity={config.opacity} />
          ) : (
            <circle
              cx={branch.x2}
              cy={branch.y2}
              r={1.4}
              fill="none"
              stroke={strokeColor}
              strokeWidth={0.8}
              strokeOpacity={config.opacity}
            />
          )}
        </g>
      ))}
      {crackSegments > 0 && (
        <polyline
          points={buildCrackPoints(cx, baseY, forkY, crackSegments, rand)}
          fill="none"
          stroke="var(--maroon)"
          strokeWidth={1}
        />
      )}
    </svg>
  );
}

export default SpaceGlyph;
