// Renders every Reference block across every Space as nodes and edges
// -- "the Map" from CLAUDE.md. Pure, stateless rendering: no graph
// structure is stored anywhere, this just draws whatever getGraphData()
// (backend/src/db/queries.js) returns each time it's fetched, straight
// from the blocks table.

const CENTER = 200;
const RADIUS = 160;

function layoutNodes(spaces) {
  const count = spaces.length;
  return spaces.map((space, index) => {
    const angle = (2 * Math.PI * index) / Math.max(count, 1);
    return {
      ...space,
      x: CENTER + RADIUS * Math.cos(angle),
      y: CENTER + RADIUS * Math.sin(angle),
    };
  });
}

function GraphView({ spaces, edges }) {
  if (spaces.length === 0) {
    return <p>No Spaces yet.</p>;
  }

  const nodes = layoutNodes(spaces);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  return (
    <svg className="graph-svg" width={CENTER * 2} height={CENTER * 2}>
      <defs>
        <marker id="graph-arrow" markerWidth="8" markerHeight="8" refX="8" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill="var(--ink-faint)" />
        </marker>
      </defs>
      {edges.map((edge) => {
        const from = nodeById.get(edge.sourceSpaceId);
        const to = nodeById.get(edge.targetSpaceId);
        if (!from || !to) return null;
        return (
          <line
            key={edge.blockId}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            stroke="var(--ink-faint)"
            markerEnd="url(#graph-arrow)"
          />
        );
      })}
      {nodes.map((node) => (
        <g key={node.id}>
          <circle cx={node.x} cy={node.y} r={8} fill="var(--maroon-bright)" />
          <text x={node.x + 10} y={node.y + 4} fontSize="12" fill="var(--ink)" fontFamily="var(--mono)">
            {node.title}
          </text>
        </g>
      ))}
    </svg>
  );
}

export default GraphView;
