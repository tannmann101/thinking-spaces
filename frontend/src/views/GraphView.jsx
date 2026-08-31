// Renders every Reference block across every Space as an interactive
// node/link map -- "the Relational Map" from CLAUDE.md. Still pure,
// stateless-in, live-data-out: no graph structure is stored anywhere,
// this just draws whatever getGraphData() (backend/src/db/queries.js)
// returns each time it's fetched, straight from the blocks table. Only
// the *positions* are local to this component (a lightweight,
// hand-rolled force simulation, not a library -- this app deliberately
// stays free of extra dependencies for something this small), and
// those reset on reload rather than being saved, in the same spirit as
// Obsidian's own graph view: dragging repositions a node for this
// session, it doesn't rewrite a stored layout.
//
// Interaction: drag a node to reposition it (it rejoins the simulation
// on release), drag the background to pan, scroll to zoom, click a
// node (without dragging it) to open that Space. Hovering a node
// highlights its connections.

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const WIDTH = 640;
const HEIGHT = 440;
const MIN_VB_WIDTH = 160;
const MAX_VB_WIDTH = 2200;
const REPULSION = 2400;
const SPRING_LENGTH = 110;
const SPRING_STRENGTH = 0.02;
const CENTER_STRENGTH = 0.01;
const DAMPING = 0.85;
const CLICK_DRAG_THRESHOLD = 4; // px of screen movement before a node-press counts as a drag, not a click

const STATUS_OPACITY = { nascent: 0.5, developing: 0.75, mature: 1, dormant: 0.35 };

function seededPosition(index, count) {
  const angle = (2 * Math.PI * index) / Math.max(count, 1);
  const r = Math.min(WIDTH, HEIGHT) * 0.3;
  return { x: WIDTH / 2 + r * Math.cos(angle), y: HEIGHT / 2 + r * Math.sin(angle) };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function GraphView({ spaces, edges }) {
  const navigate = useNavigate();
  const svgRef = useRef(null);
  const nodesRef = useRef([]); // [{ id, title, status, x, y, vx, vy, dragging }]
  const gestureRef = useRef(null); // in-flight pan/drag gesture, see onNodeMouseDown/onBackgroundMouseDown
  const [, forceRender] = useState(0);
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, w: WIDTH, h: HEIGHT });
  const [hoveredId, setHoveredId] = useState(null);

  // Rebuilds the node list whenever the Spaces themselves change, but
  // keeps each existing node's current position/velocity intact -- so
  // an ordinary refetch (after creating a Reference elsewhere, say)
  // doesn't reset the whole map back to its starting layout.
  useEffect(() => {
    const existing = new Map(nodesRef.current.map((node) => [node.id, node]));
    nodesRef.current = spaces.map((space, index) => {
      const prior = existing.get(space.id);
      if (prior) return { ...prior, title: space.title, status: space.status };
      const seed = seededPosition(index, spaces.length);
      return { id: space.id, title: space.title, status: space.status, ...seed, vx: 0, vy: 0 };
    });
  }, [spaces]);

  // The physics: repulsion between every pair of nodes, a spring along
  // every edge pulling its two ends toward a natural resting distance,
  // and a gentle pull toward center so the graph doesn't drift off
  // screen. Runs continuously rather than settling once and stopping --
  // simpler than deciding when it's "done", and it means the map keeps
  // reacting if a node gets dragged later.
  useEffect(() => {
    let frame;
    function tick() {
      const nodes = nodesRef.current;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = a.x - b.x || 0.01;
          const dy = a.y - b.y || 0.01;
          const distSq = dx * dx + dy * dy;
          const dist = Math.sqrt(distSq);
          const force = REPULSION / distSq;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          if (!a.dragging) {
            a.vx += fx;
            a.vy += fy;
          }
          if (!b.dragging) {
            b.vx -= fx;
            b.vy -= fy;
          }
        }
      }
      edges.forEach((edge) => {
        const a = nodes.find((node) => node.id === edge.sourceSpaceId);
        const b = nodes.find((node) => node.id === edge.targetSpaceId);
        if (!a || !b) return;
        const dx = b.x - a.x || 0.01;
        const dy = b.y - a.y || 0.01;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const diff = (dist - SPRING_LENGTH) * SPRING_STRENGTH;
        const fx = (dx / dist) * diff;
        const fy = (dy / dist) * diff;
        if (!a.dragging) {
          a.vx += fx;
          a.vy += fy;
        }
        if (!b.dragging) {
          b.vx -= fx;
          b.vy -= fy;
        }
      });
      nodes.forEach((node) => {
        if (node.dragging) return;
        node.vx += (WIDTH / 2 - node.x) * CENTER_STRENGTH;
        node.vy += (HEIGHT / 2 - node.y) * CENTER_STRENGTH;
        node.vx *= DAMPING;
        node.vy *= DAMPING;
        node.x += node.vx;
        node.y += node.vy;
      });
      forceRender((n) => n + 1);
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [edges]);

  // Scroll-to-zoom, keeping whatever graph point is under the cursor
  // fixed in place -- attached as a native listener (not React's
  // onWheel) because React treats wheel listeners as passive by
  // default, which silently defeats preventDefault() and lets the
  // whole page scroll instead of just zooming the graph.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    function onWheel(event) {
      event.preventDefault();
      const rect = svg.getBoundingClientRect();
      const fx = (event.clientX - rect.left) / rect.width;
      const fy = (event.clientY - rect.top) / rect.height;
      setViewBox((vb) => {
        const scale = event.deltaY > 0 ? 1.1 : 1 / 1.1;
        const newW = clamp(vb.w * scale, MIN_VB_WIDTH, MAX_VB_WIDTH);
        const newH = (vb.h * newW) / vb.w;
        const graphX = vb.x + fx * vb.w;
        const graphY = vb.y + fy * vb.h;
        return { x: graphX - fx * newW, y: graphY - fy * newH, w: newW, h: newH };
      });
    }
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, []);

  function toGraphPoint(clientX, clientY) {
    const rect = svgRef.current.getBoundingClientRect();
    const vb = viewBox;
    return {
      x: vb.x + ((clientX - rect.left) / rect.width) * vb.w,
      y: vb.y + ((clientY - rect.top) / rect.height) * vb.h,
    };
  }

  function onNodeMouseDown(event, node) {
    event.stopPropagation();
    node.dragging = true;
    gestureRef.current = { kind: 'node', node, startClientX: event.clientX, startClientY: event.clientY, moved: false };
  }

  function onBackgroundMouseDown(event) {
    gestureRef.current = {
      kind: 'pan',
      startClientX: event.clientX,
      startClientY: event.clientY,
      startViewBox: viewBox,
    };
  }

  function onMouseMove(event) {
    const gesture = gestureRef.current;
    if (!gesture) return;
    const dx = event.clientX - gesture.startClientX;
    const dy = event.clientY - gesture.startClientY;
    if (Math.abs(dx) > CLICK_DRAG_THRESHOLD || Math.abs(dy) > CLICK_DRAG_THRESHOLD) {
      gesture.moved = true;
    }
    if (gesture.kind === 'node') {
      const point = toGraphPoint(event.clientX, event.clientY);
      gesture.node.x = point.x;
      gesture.node.y = point.y;
      gesture.node.vx = 0;
      gesture.node.vy = 0;
      forceRender((n) => n + 1);
    } else if (gesture.kind === 'pan') {
      const rect = svgRef.current.getBoundingClientRect();
      const scale = gesture.startViewBox.w / rect.width;
      setViewBox({
        ...gesture.startViewBox,
        x: gesture.startViewBox.x - dx * scale,
        y: gesture.startViewBox.y - dy * scale,
      });
    }
  }

  function onMouseUp(event) {
    const gesture = gestureRef.current;
    if (!gesture) return;
    if (gesture.kind === 'node') {
      gesture.node.dragging = false;
      if (!gesture.moved) {
        navigate(`/spaces/${gesture.node.id}`);
      }
    }
    gestureRef.current = null;
  }

  if (spaces.length === 0) {
    return <p>No Spaces yet.</p>;
  }

  const nodes = nodesRef.current;
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const degreeById = new Map();
  edges.forEach((edge) => {
    degreeById.set(edge.sourceSpaceId, (degreeById.get(edge.sourceSpaceId) || 0) + 1);
    degreeById.set(edge.targetSpaceId, (degreeById.get(edge.targetSpaceId) || 0) + 1);
  });

  return (
    <svg
      ref={svgRef}
      className="graph-svg"
      width={WIDTH}
      height={HEIGHT}
      viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
      onMouseDown={onBackgroundMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      style={{ cursor: gestureRef.current?.kind === 'pan' ? 'grabbing' : 'grab' }}
    >
      <defs>
        <marker id="graph-arrow" markerWidth="8" markerHeight="8" refX="8" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill="var(--ink-faint)" />
        </marker>
      </defs>
      {edges.map((edge) => {
        const from = nodeById.get(edge.sourceSpaceId);
        const to = nodeById.get(edge.targetSpaceId);
        if (!from || !to) return null;
        const connected = hoveredId && (edge.sourceSpaceId === hoveredId || edge.targetSpaceId === hoveredId);
        const dimmed = hoveredId && !connected;
        return (
          <line
            key={edge.blockId}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            stroke={connected ? 'var(--maroon-bright)' : 'var(--ink-faint)'}
            strokeWidth={connected ? 2 : 1}
            opacity={dimmed ? 0.25 : 1}
            markerEnd="url(#graph-arrow)"
          />
        );
      })}
      {nodes.map((node) => {
        const degree = degreeById.get(node.id) || 0;
        const radius = 7 + Math.min(degree, 6) * 1.3;
        const dimmed = hoveredId && hoveredId !== node.id && !edges.some(
          (edge) =>
            (edge.sourceSpaceId === hoveredId && edge.targetSpaceId === node.id) ||
            (edge.targetSpaceId === hoveredId && edge.sourceSpaceId === node.id)
        );
        return (
          <g
            key={node.id}
            onMouseDown={(event) => onNodeMouseDown(event, node)}
            onMouseEnter={() => setHoveredId(node.id)}
            onMouseLeave={() => setHoveredId(null)}
            style={{ cursor: 'pointer' }}
            opacity={dimmed ? 0.35 : 1}
          >
            <circle
              cx={node.x}
              cy={node.y}
              r={radius}
              fill="var(--maroon-bright)"
              fillOpacity={STATUS_OPACITY[node.status] ?? 0.6}
            />
            <text x={node.x + radius + 4} y={node.y + 4} fontSize="12" fill="var(--ink)" fontFamily="var(--mono)">
              {node.title}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default GraphView;
