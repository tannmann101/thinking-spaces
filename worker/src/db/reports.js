// Ported from backend/src/db/queries/reports.js.

import { WORK_TYPES } from './work.js';
import { getBlockById, listBlocksForSpace, listBacklinksForSpace } from './blocks.js';
import { getWorkspaceById, listWorkspacesForSpace } from './workspaces.js';
import { getProjectById, listProjectsForSpace } from './projects.js';
import { getSpaceById } from './spaces.js';
import { getGoalById } from './goals.js';
import { listTrailEntries } from './trail.js';
import { getSkeletonSnapshot } from './skeleton.js';

function labelForBlock(block) {
  if (WORK_TYPES.includes(block.type)) return block.content.statement || `(untitled ${block.type})`;
  if (block.type === 'text') {
    const firstLine = (block.content.lines || []).map((line) => line.text).find((text) => text.trim());
    return firstLine || '(empty Writing)';
  }
  if (block.type === 'list') return block.content.laneLabel || '(untitled List)';
  if (block.type === 'reference') return `Reference to ${block.content.targetSpaceTitle || block.content.target_space_id}`;
  if (block.type === 'media') return block.content.caption || '(untitled Media)';
  if (block.type === 'comparison') return `${block.content.left?.text || '?'} vs. ${block.content.right?.text || '?'}`;
  if (block.type === 'milestone') return block.content.label || '(untitled Milestone)';
  if (block.type === 'session') return block.content.label || '(untitled Session)';
  if (block.type === 'wordEvolution') return block.content.term || '(unnamed Word Evolution)';
  if (block.type === 'conceptMap') return block.content.referent || '(unnamed Concept Map)';
  if (block.type === 'model') return block.content.subject || '(unnamed Model)';
  return `${block.type} entry`;
}

function summarizeBlockContent(block) {
  const { type, content } = block;
  if (type === 'text') {
    const lines = content.lines || [];
    const words = lines.map((line) => line.text).join(' ').trim().split(/\s+/).filter(Boolean).length;
    const tags = [...new Set(lines.map((line) => line.tag).filter(Boolean))];
    return [
      `${lines.length} line${lines.length === 1 ? '' : 's'}, ${words} word${words === 1 ? '' : 's'}`,
      ...(tags.length > 0 ? [`Tagged: ${tags.join(', ')}`] : []),
      ...lines.filter((line) => line.text.trim()).map((line) => line.text),
    ];
  }
  if (type === 'list') {
    const items = content.items || [];
    const checkable = items.filter((item) => typeof item.checkbox === 'boolean');
    return [
      `${items.length} item${items.length === 1 ? '' : 's'}${
        checkable.length > 0 ? ` (${checkable.filter((item) => item.checkbox).length}/${checkable.length} checked)` : ''
      }`,
      ...items.map((item) => `${typeof item.checkbox === 'boolean' ? (item.checkbox ? '[x] ' : '[ ] ') : ''}${item.text}`),
    ];
  }
  if (type === 'reference') {
    return [`Links to: ${content.targetSpaceTitle || content.target_space_id}`, ...(content.note ? [`Note: ${content.note}`] : [])];
  }
  if (type === 'media') {
    return [`Media type: ${content.mediaType}`, ...(content.caption ? [`Caption: ${content.caption}`] : [])];
  }
  if (type === 'comparison') {
    return [
      `Left: ${content.left?.text || '(empty)'}`,
      `Right: ${content.right?.text || '(empty)'}`,
      ...(content.contrast ? [`Marked as a contrast${content.contrastNote ? `: ${content.contrastNote}` : ''}`] : []),
    ];
  }
  if (WORK_TYPES.includes(type)) {
    return [
      `Statement: ${content.statement || '(no statement yet)'}`,
      `Confidence: ${content.confidence || 'tentative'}`,
      ...(content.support || []).map((point) => `Support: ${point.text || '(linked claim)'}`),
    ];
  }
  if (type === 'milestone') {
    return [
      `Target date: ${content.targetDate || '(not set)'}`,
      `Status: ${content.reached ? `Reached${content.reachedAt ? ` on ${content.reachedAt}` : ''}` : 'Not yet reached'}`,
      ...(content.note ? [`Note: ${content.note}`] : []),
    ];
  }
  if (type === 'session') {
    const status = content.endedAt
      ? `Completed, ${content.durationMinutes ?? '?'} minutes`
      : content.startedAt
      ? 'Currently running'
      : 'Not started';
    return [
      `Status: ${status}`,
      ...(content.startedAt ? [`Started: ${content.startedAt}`] : []),
      ...(content.endedAt ? [`Ended: ${content.endedAt}`] : []),
      ...(content.note ? [`Note: ${content.note}`] : []),
    ];
  }
  if (type === 'wordEvolution') {
    return [
      `Term: ${content.term || '(not named)'}`,
      ...(content.senses || []).map(
        (entry) => `${entry.period || 'Stage'}: ${entry.sense || '(no sense recorded)'}${entry.note ? ` -- ${entry.note}` : ''}`
      ),
    ];
  }
  if (type === 'conceptMap') {
    return [
      `Referent: ${content.referent || '(not named)'}`,
      ...(content.gloss ? [`Proper rendering: ${content.gloss}`] : []),
      ...(content.renderings || []).map(
        (entry) =>
          `${entry.alignment || 'partial'}: "${entry.label || '(unnamed)'}"${entry.sense ? ` -- taken as ${entry.sense}` : ''}`
      ),
    ];
  }
  if (type === 'model') {
    // Relations store component ids, so resolve each end to its current
    // name here the same way ModelBlock.jsx does at render time.
    const nameFor = (id) => (content.components || []).find((component) => component.id === id)?.name || '(removed)';
    return [
      `Subject: ${content.subject || '(not named)'}`,
      ...(content.components || []).map(
        (component) => `Component: ${component.name || '(unnamed)'}${component.role ? ` -- ${component.role}` : ''}`
      ),
      ...(content.relations || []).map(
        (relation) => `Relation: ${nameFor(relation.from)} ${relation.kind || 'relates to'} ${nameFor(relation.to)}`
      ),
    ];
  }
  return [`(no summary available for entry type "${type}")`];
}

// The reverse of CreateSynthesis.jsx's own lineage-recording: given a
// Work item's block id, finds every Synthesis Space whose own "Source
// Material" block lists it in properties.sourceItemIds. A Work item
// can feed more than one Synthesis, so this returns every match.
async function findSynthesesUsingWorkItem(env, blockId) {
  const { results } = await env.DB.prepare(
    `SELECT spaces.id AS space_id, spaces.title AS space_title
     FROM blocks
     JOIN spaces ON spaces.id = blocks.space_id
     JOIN json_each(blocks.properties, '$.sourceItemIds') AS item
     WHERE blocks.type = 'text' AND item.value = ?`
  )
    .bind(blockId)
    .all();
  return results;
}

export async function getBlockReport(env, blockId) {
  const block = await getBlockById(env, blockId);
  if (!block) return null;
  const space = await env.DB.prepare(`SELECT title FROM spaces WHERE id = ?`).bind(block.space_id).first();

  const usedInSyntheses = WORK_TYPES.includes(block.type) ? await findSynthesesUsingWorkItem(env, blockId) : [];

  const workspaceIds = block.properties?.workspaces || [];
  let workspaceNames = [];
  if (workspaceIds.length > 0) {
    const { results } = await env.DB.prepare(`SELECT name FROM workspaces WHERE id IN (${workspaceIds.map(() => '?').join(', ')})`)
      .bind(...workspaceIds)
      .all();
    workspaceNames = results.map((row) => row.name);
  }

  const project = block.properties?.projectId ? await getProjectById(env, block.properties.projectId) : null;

  const membershipLines = [
    ...((block.properties?.categories || []).length > 0 ? [`Categories: ${block.properties.categories.join(', ')}`] : []),
    ...(workspaceNames.length > 0 ? [`Workspaces: ${workspaceNames.join(', ')}`] : []),
    ...(project ? [`Project: ${project.name}`] : []),
    ...(block.properties?.skeletonLane ? [`Skeleton section: ${block.properties.skeletonLane}`] : []),
    ...(block.properties?.skeletonRole ? [`Skeleton role: ${block.properties.skeletonRole}`] : []),
    ...(usedInSyntheses.length > 0
      ? [`Used in Synthesis: ${usedInSyntheses.map((row) => row.space_title).join(', ')}`]
      : []),
  ];

  const sections = [
    {
      heading: 'Identity',
      lines: [
        `Type: ${block.type}`,
        `Space: ${space?.title || block.space_id}`,
        `Created: ${block.created_at}`,
        `Last updated: ${block.updated_at}`,
      ],
    },
    { heading: 'Content', lines: summarizeBlockContent(block) },
  ];
  if (membershipLines.length > 0) {
    sections.push({ heading: 'Membership', lines: membershipLines });
  }

  return { level: 'block', id: block.id, label: labelForBlock(block), generatedAt: new Date().toISOString(), sections };
}

export async function getWorkspaceReport(env, workspaceId) {
  const workspace = await getWorkspaceById(env, workspaceId);
  if (!workspace) return null;
  const space = await env.DB.prepare(`SELECT title FROM spaces WHERE id = ?`).bind(workspace.space_id).first();
  const blocks = await listBlocksForSpace(env, workspace.space_id);
  const memberBlocks = blocks.filter((block) => (block.properties?.workspaces || []).includes(workspaceId));

  const sections = [
    {
      heading: 'Identity',
      lines: [
        `Space: ${space?.title || workspace.space_id}`,
        // The kind key, not a display label -- the labels live in the
        // frontend registry, which the backend deliberately doesn't read.
        ...(workspace.kind ? [`Kind: ${workspace.kind}`] : []),
        `Created: ${workspace.created_at}`,
      ],
    },
    {
      heading: `Assembled Tools (${memberBlocks.length})`,
      lines: memberBlocks.map((block) => `${block.type}: ${labelForBlock(block)}`),
    },
  ];

  return { level: 'workspace', id: workspace.id, label: workspace.name, generatedAt: new Date().toISOString(), sections };
}

export async function getProjectReport(env, projectId) {
  const project = await getProjectById(env, projectId);
  if (!project) return null;

  // A Project's work can live in any number of Spaces, so its members
  // are gathered by projectId across every Space rather than read out
  // of one Space's own feed.
  const memberRows = (
    await env.DB.prepare(
      `SELECT blocks.id AS block_id, spaces.title AS space_title
         FROM blocks
         JOIN spaces ON spaces.id = blocks.space_id
        WHERE json_extract(blocks.properties, '$.projectId') = ?
        ORDER BY spaces.title ASC, blocks.position ASC`
    )
      .bind(projectId)
      .all()
  ).results;
  const memberBlocks = [];
  for (const row of memberRows) {
    memberBlocks.push({ ...(await getBlockById(env, row.block_id)), spaceTitle: row.space_title });
  }
  const spaceTitles = [...new Set(memberRows.map((row) => row.space_title))];

  const milestones = memberBlocks.filter((block) => block.type === 'milestone');
  const sessions = memberBlocks.filter((block) => block.type === 'session');
  const reached = milestones.filter((block) => block.content.reached).length;
  const totalMinutes = sessions.reduce((sum, block) => sum + (block.content.durationMinutes || 0), 0);

  const goal = project.goal_id ? await getGoalById(env, project.goal_id) : null;

  const sections = [
    {
      heading: 'Identity',
      lines: [
        ...(goal ? [`Goal: ${goal.name}`] : []),
        ...(spaceTitles.length > 0 ? [`Spaces: ${spaceTitles.join(', ')}`] : ['Spaces: none yet']),
        `Created: ${project.created_at}`,
      ],
    },
    {
      heading: `Assigned Milestones & Sessions (${memberBlocks.length})`,
      lines: [
        ...(milestones.length > 0 ? [`Milestones: ${reached} of ${milestones.length} reached`] : []),
        ...(sessions.length > 0 ? [`Sessions: ${totalMinutes} min logged across ${sessions.length}`] : []),
        ...memberBlocks.map((block) => `${block.type}: ${labelForBlock(block)} (in ${block.spaceTitle})`),
      ],
    },
  ];

  return { level: 'project', id: project.id, label: project.name, generatedAt: new Date().toISOString(), sections };
}

export async function getSpaceReport(env, spaceId) {
  const space = await getSpaceById(env, spaceId);
  if (!space) return null;
  const blocks = await listBlocksForSpace(env, spaceId);
  const workspaces = await listWorkspacesForSpace(env, spaceId);
  const projects = await listProjectsForSpace(env, spaceId);
  const backlinks = await listBacklinksForSpace(env, spaceId);
  const trail = await listTrailEntries(env, spaceId);
  const skeleton = await getSkeletonSnapshot(env, spaceId);

  const typeCounts = {};
  blocks.forEach((block) => {
    typeCounts[block.type] = (typeCounts[block.type] || 0) + 1;
  });

  const workBlocks = blocks.filter((block) => WORK_TYPES.includes(block.type));
  const workConfidenceCounts = {};
  workBlocks.forEach((block) => {
    const level = block.content.confidence || 'tentative';
    workConfidenceCounts[level] = (workConfidenceCounts[level] || 0) + 1;
  });

  const sections = [
    {
      heading: 'Identity',
      lines: [
        `Status: ${space.status}`,
        `Due date: ${space.due_date || '(not set)'}${space.isOverdue ? ' (overdue)' : ''}`,
        `Goal: ${space.goal || '(not set)'}`,
        `Tags: ${space.tags.length > 0 ? space.tags.join(', ') : '(none)'}`,
        `Categories: ${space.categories.length > 0 ? space.categories.join(', ') : '(none)'}`,
        `Provenance: ${space.origin || '(not marked)'}`,
        `Created: ${space.created_at}`,
        `Last updated: ${space.updated_at}`,
      ],
    },
    {
      heading: `Structure (${blocks.length} ${blocks.length === 1 ? 'entry' : 'entries'})`,
      lines: [
        ...Object.entries(typeCounts).map(([type, count]) => `${count} ${type}`),
        ...(workspaces.length > 0 ? [`Workspaces: ${workspaces.map((workspace) => workspace.name).join(', ')}`] : []),
        ...(projects.length > 0 ? [`Projects: ${projects.map((project) => project.name).join(', ')}`] : []),
      ],
    },
  ];

  if (workBlocks.length > 0) {
    sections.push({
      heading: `Work (${workBlocks.length} item${workBlocks.length === 1 ? '' : 's'})`,
      lines: [
        ...Object.entries(workConfidenceCounts).map(([level, count]) => `${count} at "${level}" confidence`),
        ...workBlocks.map(
          (block) => `${block.type}: ${block.content.statement || '(no statement yet)'} [${block.content.confidence || 'tentative'}]`
        ),
      ],
    });
  }

  const milestoneBlocks = blocks.filter((block) => block.type === 'milestone');
  if (milestoneBlocks.length > 0) {
    const reachedCount = milestoneBlocks.filter((block) => block.content.reached).length;
    sections.push({
      heading: `Milestones (${reachedCount}/${milestoneBlocks.length} reached)`,
      lines: milestoneBlocks.map((block) => {
        const { label, targetDate, reached, reachedAt } = block.content;
        const status = reached ? `reached${reachedAt ? ` ${reachedAt}` : ''}` : `target ${targetDate || '(not set)'}`;
        return `${label || '(untitled)'} -- ${status}`;
      }),
    });
  }

  const sessionBlocks = blocks.filter((block) => block.type === 'session');
  if (sessionBlocks.length > 0) {
    const totalMinutes = sessionBlocks.reduce((sum, block) => sum + (block.content.durationMinutes || 0), 0);
    sections.push({
      heading: `Sessions (${sessionBlocks.length}, ${totalMinutes} min logged)`,
      lines: sessionBlocks.map((block) => {
        const { label, startedAt, endedAt, durationMinutes } = block.content;
        const status = endedAt ? `${durationMinutes ?? '?'} min` : startedAt ? 'running' : 'not started';
        return `${label || '(untitled)'} -- ${status}`;
      }),
    });
  }

  const relationalLines = [
    ...blocks
      .filter((block) => block.type === 'reference')
      .map(
        (block) =>
          `-> ${block.content.targetSpaceTitle || block.content.target_space_id}${block.content.note ? ` (${block.content.note})` : ''}`
      ),
    ...backlinks.map((link) => `<- ${link.sourceSpaceTitle}${link.note ? ` (${link.note})` : ''}`),
  ];
  if (relationalLines.length > 0) {
    sections.push({ heading: 'Relational', lines: relationalLines });
  }

  const skeletonLines = Object.values(skeleton.lanes).map(
    (lane) => `${lane.label}: ${lane.items.length} item${lane.items.length === 1 ? '' : 's'}`
  );
  (skeleton.lanes.tensions?.items || []).forEach((item) => skeletonLines.push(`Tension: ${item.text}`));
  if (skeletonLines.length > 0) {
    sections.push({ heading: 'Skeleton', lines: skeletonLines });
  }

  if (trail.length > 0) {
    sections.push({
      heading: 'Recent Trail',
      lines: trail
        .slice(-5)
        .reverse()
        .map((entry) => `${entry.kind === 'manual' ? entry.note : entry.summary} (${entry.created_at})`),
    });
  }

  return { level: 'space', id: space.id, label: space.title, generatedAt: new Date().toISOString(), sections };
}
