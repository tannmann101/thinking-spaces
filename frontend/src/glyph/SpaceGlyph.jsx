// Visual Identity: a small generated glyph reflecting a Space's actual
// data, not decoration. Per the Tools & Resources doc, three
// independent, computed dimensions:
//   - status         -> how "filled in" the glyph looks (opacity,
//                        stroke weight, whether branch tips are solid)
//   - relation density (References in + out) -> how many branches
//     radiate from the trunk
//   - open tension count -> a jagged crack drawn through the trunk
//
// Branch *angles* are seeded from the Space's id purely so glyphs with
// the same branch count don't all look identical -- that's a rendering
// choice, not a fourth data channel.
//
// Not implemented here: the manual accent layer the doc describes (a
// small fixed set of hand-added marks on top of the computed base) --
// that's a separate feature (a UI for picking and persisting one),
// out of scope for "make the computed glyph real."

const STATUS_STYLE = {
  nascent: { opacity: 0.4, strokeWidth: 1, tipFilled: false, grey: false },
  developing: { opacity: 0.7, strokeWidth: 1.3, tipFilled: true, grey: false },
  mature: { opacity: 1, strokeWidth: 1.8, tipFilled: true, grey: false },
  dormant: { opacity: 0.35, strokeWidth: 1, tipFilled: false, grey: true },
};

const MAX_BRANCHES = 6;
const MAX_CRACK_SEGMENTS = 4;

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
  const status = space.status || 'nascent';
  const relationDensity = space.relationDensity || 0;
  const openTensionCount = space.openTensionCount || 0;
  const config = STATUS_STYLE[status] || STATUS_STYLE.nascent;
  const rand = seededRandom(hashString(space.id));

  const cx = size / 2;
  const baseY = size - 2;
  const forkY = size * 0.55;
  const branchCount = Math.min(relationDensity, MAX_BRANCHES);
  const strokeColor = config.grey ? '#999' : '#222';

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

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`Visual identity: ${status}, ${relationDensity} connections, ${openTensionCount} open tensions`}
    >
      <line
        x1={cx}
        y1={baseY}
        x2={cx}
        y2={forkY}
        stroke={strokeColor}
        strokeWidth={config.strokeWidth}
        strokeOpacity={config.opacity}
        strokeLinecap="round"
      />
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
          stroke="#c0392b"
          strokeWidth={1}
        />
      )}
    </svg>
  );
}

export default SpaceGlyph;
