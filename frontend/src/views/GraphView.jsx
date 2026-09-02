// Renders every Reference block across every Space, plus every
// Workspace and every Project inside those Spaces, as an interactive
// node/link map -- "the Relational Map" from CLAUDE.md. Still pure,
// stateless-in, live-data-out: no graph structure is stored anywhere,
// this just draws whatever getGraphData() (backend/src/db/queries.js)
// returns each time it's fetched, straight from the
// blocks/workspaces/projects tables. Only the *positions* are local to
// this component (a lightweight, hand-rolled force simulation, not a
// library -- this app deliberately stays free of extra dependencies for
// something this small), and those reset on reload rather than being
// saved, in the same spirit as Obsidian's own graph view: dragging
// repositions a node for this session, it doesn't rewrite a stored
// layout.
//
// Three kinds of node (Space, Workspace, Project) and three kinds of
// edge (a "reference" edge between two Spaces; a "contains" edge from a
// Space to one of its own Workspaces; a "contains-project" edge from a
// Space to one of its own Projects) share one graph. A Workspace is
// drawn smaller, as a square rather than a circle; a Project is drawn
// the same size but as a diamond, in the Time family's own gold accent
// rather than Workspace's maroon -- the same "General stays neutral,
// Work gets maroon, Time gets gold" convention the block-family stripes
// and Visual Identity's manual accent already use, extended here so a
// Project reads as a genuinely different kind of grouping rather than a
// same-colored twin of Workspace. Both contained-node kinds pull in
// tight to their parent Space by a short, unstyled "contains"-style
// spring, so they read as belonging to that Space rather than as a peer
// connection. Node ids are namespaced (`space:<id>` / `workspace:<id>` /
// `project:<id>`) since ids come from three different tables and could
// theoretically collide.
//
// Interaction: drag a node to reposition it (it rejoins the simulation
// on release), drag the background to pan, scroll to zoom, click a node
// (without dragging it) to open that Space, Workspace, or Project.
// Hovering a node highlights its connections (a Space's Workspaces and
// Projects included).

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

// Widened from an original 640x440 (keeping the same ~1.45 aspect
// ratio) as part of the aesthetics-pass audit: node labels near the
// canvas edge were getting clipped by the SVG's own default
// `overflow: hidden`, since the physics loop has no reason to keep a
// node (and the label extending past it) inside any particular
// bound other than gently drifting back toward the center -- more
// logical room lowers how often a label actually reaches the edge.
// Paired with `.graph-frame` in index.css, which widens the page's
// own container so the bigger canvas doesn't just render everything
// smaller to compensate.
const WIDTH = 900;
const HEIGHT = 620;
const MIN_VB_WIDTH = 160;
const MAX_VB_WIDTH = 2200;
const REPULSION = 2400;
const SPRING_LENGTH = 110;
const SPRING_STRENGTH = 0.02;
const CONTAINS_SPRING_LENGTH = 40;
const CONTAINS_SPRING_STRENGTH = 0.05;
const CENTER_STRENGTH = 0.01;
const DAMPING = 0.85;
const CLICK_DRAG_THRESHOLD = 4; // px of screen movement before a node-press counts as a drag, not a click
const WORKSPACE_RADIUS = 5;
const PROJECT_RADIUS = 5;

const STATUS_OPACITY = { dormant: 0.35, inactive: 0.5, active: 0.75, interesting: 0.9, mature: 1 };

function seededPosition(index, count) {
  const angle = (2 * Math.PI * index) / Math.max(count, 1);
  const r = Math.min(WIDTH, HEIGHT) * 0.3;
  return { x: WIDTH / 2 + r * Math.cos(angle), y: HEIGHT / 2 + r * Math.sin(angle) };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// An edge's two endpoint node ids, namespaced to match node.id below --
// the one place that translation happens, so nothing else needs to know
// the two different field-naming conventions a "reference" vs a
// "contains" edge use on the wire.
function edgeEndpoints(edge) {
  if (edge.kind === 'contains') {
    return [`space:${edge.spaceId}`, `workspace:${edge.workspaceId}`];
  }
  if (edge.kind === 'contains-project') {
    return [`space:${edge.spaceId}`, `project:${edge.projectId}`];
  }
  return [`space:${edge.sourceSpaceId}`, `space:${edge.targetSpaceId}`];
}

function GraphView({ spaces, workspaces = [], projects = [], edges }) {
  const navigate = useNavigate();
  const svgRef = useRef(null);
  const nodesRef = useRef([]); // [{ id, kind, rawId, parentSpaceId?, title, status?, x, y, vx, vy, dragging }]
  const gestureRef = useRef(null); // in-flight pan/drag gesture, see onNodeMouseDown/onBackgroundMouseDown
  const [, forceRender] = useState(0);
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, w: WIDTH, h: HEIGHT });
  const [hoveredId, setHoveredId] = useState(null);

  // Rebuilds the node list whenever the Spaces or Workspaces themselves
  // change, but keeps each existing node's current position/velocity
  // intact -- so an ordinary refetch (after creating a Reference or a
  // Workspace elsewhere, say) doesn't reset the whole map back to its
  // starting layout. A brand-new Workspace node seeds near its parent
  // Space (when that Space's position is already known) rather than at
  // a generic point on the outer circle, so it visually starts attached.
  useEffect(() => {
    const existing = new Map(nodesRef.current.map((node) => [node.id, node]));
    const spaceNodes = spaces.map((space, index) => {
      const id = `space:${space.id}`;
      const prior = existing.get(id);
      if (prior) return { ...prior, title: space.title, status: space.status };
      const seed = seededPosition(index, spaces.length);
      return { id, kind: 'space', rawId: space.id, title: space.title, status: space.status, ...seed, vx: 0, vy: 0 };
    });
    const spaceNodeById = new Map(spaceNodes.map((node) => [node.rawId, node]));
    const workspaceNodes = workspaces.map((workspace, index) => {
      const id = `workspace:${workspace.id}`;
      const prior = existing.get(id);
      if (prior) return { ...prior, title: workspace.name };
      const parent = spaceNodeById.get(workspace.space_id);
      const seed = parent
        ? { x: parent.x + (Math.random() - 0.5) * 20, y: parent.y + (Math.random() - 0.5) * 20 }
        : seededPosition(index, workspaces.length);
      return {
        id,
        kind: 'workspace',
        rawId: workspace.id,
        parentSpaceId: workspace.space_id,
        title: workspace.name,
        ...seed,
        vx: 0,
        vy: 0,
      };
    });
    const projectNodes = projects.map((project, index) => {
      const id = `project:${project.id}`;
      const prior = existing.get(id);
      if (prior) return { ...prior, title: project.name };
      const parent = spaceNodeById.get(project.space_id);
      const seed = parent
        ? { x: parent.x + (Math.random() - 0.5) * 20, y: parent.y + (Math.random() - 0.5) * 20 }
        : seededPosition(index, projects.length);
      return {
        id,
        kind: 'project',
        rawId: project.id,
        parentSpaceId: project.space_id,
        title: project.name,
        ...seed,
        vx: 0,
        vy: 0,
      };
    });
    nodesRef.current = [...spaceNodes, ...workspaceNodes, ...projectNodes];
  }, [spaces, workspaces, projects]);

  // The physics: repulsion between every pair of nodes, a spring along
  // every edge pulling its two ends toward a natural resting distance (a
  // much shorter, stiffer one for a "contains" edge, so a Workspace
  // stays visually tucked against its Space), and a gentle pull toward
  // center so the graph doesn't drift off screen. Runs continuously
  // rather than settling once and stopping -- simpler than deciding when
  // it's "done", and it means the map keeps reacting if a node gets
  // dragged later.
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
      const nodeById = new Map(nodes.map((node) => [node.id, node]));
      edges.forEach((edge) => {
        const [fromId, toId] = edgeEndpoints(edge);
        const a = nodeById.get(fromId);
        const b = nodeById.get(toId);
        if (!a || !b) return;
        const isContainment = edge.kind === 'contains' || edge.kind === 'contains-project';
        const length = isContainment ? CONTAINS_SPRING_LENGTH : SPRING_LENGTH;
        const strength = isContainment ? CONTAINS_SPRING_STRENGTH : SPRING_STRENGTH;
        const dx = b.x - a.x || 0.01;
        const dy = b.y - a.y || 0.01;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const diff = (dist - length) * strength;
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

  function onMouseUp() {
    const gesture = gestureRef.current;
    if (!gesture) return;
    if (gesture.kind === 'node') {
      gesture.node.dragging = false;
      if (!gesture.moved) {
        const node = gesture.node;
        if (node.kind === 'workspace') {
          navigate(`/spaces/${node.parentSpaceId}/workspaces/${node.rawId}`);
        } else if (node.kind === 'project') {
          navigate(`/spaces/${node.parentSpaceId}/projects/${node.rawId}`);
        } else {
          navigate(`/spaces/${node.rawId}`);
        }
      }
    }
    gestureRef.current = null;
  }

  if (spaces.length === 0) {
    return <p>No Spaces yet.</p>;
  }

  // Reading a ref's .current during render is a real anti-pattern in
  // general (React's own docs warn against it, and the linter flags
  // it) -- but it's a deliberate choice here, not an oversight. Copying
  // every node's live x/y/vx/vy into useState on every animation frame
  // (60fps) just to satisfy that rule would mean a full React re-render
  // cycle per frame purely to shuttle data React itself never needs to
  // reconcile against anything else. The physics loop's own
  // `forceRender` call (in the tick() effect above) already guarantees
  // a render happens on every frame the simulation is running, so this
  // never actually goes stale in practice -- it's read here, in render,
  // simply because render is where the SVG needs the current positions.
  const nodes = nodesRef.current;
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  // Only reference edges (Space-to-Space) inflate a Space's apparent
  // size -- a Workspace it contains is a different kind of relationship
  // and shouldn't visually read as "more referenced".
  const degreeById = new Map();
  edges
    .filter((edge) => edge.kind === 'reference')
    .forEach((edge) => {
      degreeById.set(edge.sourceSpaceId, (degreeById.get(edge.sourceSpaceId) || 0) + 1);
      degreeById.set(edge.targetSpaceId, (degreeById.get(edge.targetSpaceId) || 0) + 1);
    });

  function isConnectedToHover(nodeId) {
    if (!hoveredId) return false;
    return edges.some((edge) => {
      const [fromId, toId] = edgeEndpoints(edge);
      return (fromId === hoveredId && toId === nodeId) || (toId === hoveredId && fromId === nodeId);
    });
  }

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
        const [fromId, toId] = edgeEndpoints(edge);
        const from = nodeById.get(fromId);
        const to = nodeById.get(toId);
        if (!from || !to) return null;
        const connected = hoveredId && (fromId === hoveredId || toId === hoveredId);
        const dimmed = hoveredId && !connected;
        if (edge.kind === 'contains' || edge.kind === 'contains-project') {
          return (
            <line
              key={edge.kind === 'contains' ? `contains-${edge.workspaceId}` : `contains-project-${edge.projectId}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke="var(--ink-faint)"
              strokeWidth={1}
              strokeDasharray="2 3"
              opacity={dimmed ? 0.2 : 0.7}
            />
          );
        }
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
        const dimmed = hoveredId && hoveredId !== node.id && !isConnectedToHover(node.id);
        if (node.kind === 'workspace') {
          const size = WORKSPACE_RADIUS * 2;
          return (
            <g
              key={node.id}
              onMouseDown={(event) => onNodeMouseDown(event, node)}
              onMouseEnter={() => setHoveredId(node.id)}
              onMouseLeave={() => setHoveredId(null)}
              className="cursor-pointer"
              opacity={dimmed ? 0.35 : 1}
            >
              <rect
                x={node.x - WORKSPACE_RADIUS}
                y={node.y - WORKSPACE_RADIUS}
                width={size}
                height={size}
                fill="var(--surface-3)"
                stroke="var(--maroon-bright)"
                strokeWidth={1.5}
              />
              <text x={node.x + WORKSPACE_RADIUS + 4} y={node.y + 4} fontSize="11" fill="var(--ink-dim)" fontFamily="var(--mono)">
                {node.title}
              </text>
            </g>
          );
        }
        if (node.kind === 'project') {
          const r = PROJECT_RADIUS;
          const points = `${node.x},${node.y - r} ${node.x + r},${node.y} ${node.x},${node.y + r} ${node.x - r},${node.y}`;
          return (
            <g
              key={node.id}
              onMouseDown={(event) => onNodeMouseDown(event, node)}
              onMouseEnter={() => setHoveredId(node.id)}
              onMouseLeave={() => setHoveredId(null)}
              className="cursor-pointer"
              opacity={dimmed ? 0.35 : 1}
            >
              <polygon points={points} fill="var(--surface-3)" stroke="var(--accent)" strokeWidth={1.5} />
              <text x={node.x + PROJECT_RADIUS + 4} y={node.y + 4} fontSize="11" fill="var(--ink-dim)" fontFamily="var(--mono)">
                {node.title}
              </text>
            </g>
          );
        }
        const degree = degreeById.get(node.rawId) || 0;
        const radius = 7 + Math.min(degree, 6) * 1.3;
        return (
          <g
            key={node.id}
            onMouseDown={(event) => onNodeMouseDown(event, node)}
            onMouseEnter={() => setHoveredId(node.id)}
            onMouseLeave={() => setHoveredId(null)}
            className="cursor-pointer"
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
