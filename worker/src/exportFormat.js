// Renders a full export (see db/queries/exportData.js) as one readable
// Markdown document. Pure text formatting -- no database access -- kept
// separate from the query the same way reportFormat.js already is, which
// is also what lets worker/ reuse this file verbatim.
//
// One document rather than one file per Space, deliberately: a browser
// can't cleanly hand over many files without a zip dependency, and a
// single document with a contents list at the top is more durable to
// read in ten years than a folder of loose files anyway.
//
// This is the *readable* half of the export and is lossy on purpose --
// ids, positions, themes and pointer plumbing are left out because they
// mean nothing to a person reading it. The JSON export is the complete
// one; nothing here is meant to be restored from.

function parse(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function bullet(lines) {
  return lines.filter(Boolean).map((line) => `- ${line}`);
}

// A block's content rendered as readable lines. Work Types are detected
// structurally (they're the ones carrying a `statement`) rather than by
// checking against a list of type names, so a future Work Type renders
// correctly here without this file having to hear about it.
function renderBlock(block, spaceTitleById) {
  const content = parse(block.content, {});
  const type = block.type;

  if (type === 'text') {
    const lines = content.lines || [];
    if (lines.length === 0) return ['_(empty)_'];
    return lines.map((line) => (line.tag ? `${line.text} _(${line.tag})_` : line.text));
  }

  if (type === 'list') {
    const items = content.items || [];
    if (items.length === 0) return ['_(no items)_'];
    return items.map((item) => {
      const box = item.done === undefined ? '-' : item.done ? '- [x]' : '- [ ]';
      const extras = [
        item.confidence && `confidence: ${item.confidence}`,
        item.date && `date: ${item.date}`,
        item.reviewBy && `review by: ${item.reviewBy}`,
        item.number !== undefined && item.number !== null && `number: ${item.number}`,
      ].filter(Boolean);
      return `${box} ${item.text}${extras.length ? ` _(${extras.join(', ')})_` : ''}`;
    });
  }

  if (type === 'reference') {
    const target = spaceTitleById.get(content.target_space_id) || content.target_space_id || '(unknown)';
    return bullet([`References **${target}**`, content.note && `Note: ${content.note}`]);
  }

  if (type === 'media') {
    return bullet([
      content.mediaType && `Kind: ${content.mediaType}`,
      content.caption,
      content.linkTitle,
      content.fileName && `File: ${content.fileName}`,
      content.url && `Source: ${content.url}`,
    ]);
  }

  if (type === 'comparison') {
    return bullet([
      `Left: ${content.left?.text || '(empty)'}`,
      `Right: ${content.right?.text || '(empty)'}`,
      content.contrast && `Marked as a contrast${content.contrastNote ? `: ${content.contrastNote}` : ''}`,
    ]);
  }

  if (type === 'milestone') {
    return bullet([
      content.label,
      content.targetDate && `Target: ${content.targetDate}`,
      content.reached ? `Reached${content.reachedAt ? ` ${content.reachedAt}` : ''}` : 'Not yet reached',
      content.note,
    ]);
  }

  if (type === 'session') {
    return bullet([
      content.label,
      content.durationMinutes != null && `${content.durationMinutes} minutes logged`,
      content.startedAt && `Started: ${content.startedAt}`,
      content.endedAt && `Ended: ${content.endedAt}`,
      content.note,
    ]);
  }

  if (type === 'wordEvolution') {
    return [
      `**${content.term || '(unnamed)'}**`,
      ...(content.senses || []).map(
        (sense) => `- ${sense.period || 'Stage'}: ${sense.sense}${sense.note ? ` -- ${sense.note}` : ''}`
      ),
    ];
  }

  if (type === 'conceptMap') {
    return [
      `**${content.referent || '(unnamed)'}**${content.gloss ? ` -- ${content.gloss}` : ''}`,
      ...(content.renderings || []).map(
        (rendering) =>
          `- [${rendering.alignment || 'partial'}] "${rendering.label}"${
            rendering.sense ? ` -- taken as ${rendering.sense}` : ''
          }${rendering.note ? ` (${rendering.note})` : ''}`
      ),
    ];
  }

  if (type === 'model') {
    const nameFor = (id) => (content.components || []).find((c) => c.id === id)?.name || '(removed)';
    return [
      `**${content.subject || '(unnamed)'}**`,
      ...(content.components || []).map((c) => `- Component: ${c.name}${c.role ? ` -- ${c.role}` : ''}`),
      ...(content.relations || []).map(
        (r) => `- Relation: ${nameFor(r.from)} ${r.kind || 'relates to'} ${nameFor(r.to)}${r.note ? ` (${r.note})` : ''}`
      ),
    ];
  }

  // Every Work Type, detected by its shared shape rather than by name.
  if (content.statement !== undefined) {
    return bullet([
      content.statement || '(no statement yet)',
      `Confidence: ${content.confidence || 'tentative'}`,
      ...(content.support || []).map((point) => `Support: ${point.text || '(linked claim)'}`),
    ]);
  }

  return ['_(no readable form for this entry type)_'];
}

export function renderExportMarkdown(exportData) {
  const { tables, exportedAt, counts } = exportData;
  const spaces = tables.spaces || [];
  const blocks = tables.blocks || [];
  const trail = tables.trail_entries || [];
  const workspaces = tables.workspaces || [];
  const projects = tables.projects || [];

  const spaceTitleById = new Map(spaces.map((space) => [space.id, space.title]));
  const blocksBySpace = new Map();
  blocks.forEach((block) => {
    if (!blocksBySpace.has(block.space_id)) blocksBySpace.set(block.space_id, []);
    blocksBySpace.get(block.space_id).push(block);
  });

  const out = [
    '# Thinking Spaces',
    '',
    `Exported ${exportedAt}.`,
    '',
    `${counts.spaces} Spaces, ${counts.blocks} entries, ${counts.trail_entries} Trail entries.`,
    '',
    '## Contents',
    '',
    ...spaces.map((space) => `- ${space.title}`),
    '',
  ];

  spaces.forEach((space) => {
    const tags = parse(space.tags, []);
    const categories = parse(space.categories, []);
    const meta = [
      `Status: ${space.status}`,
      space.goal && `Working toward: ${space.goal}`,
      space.due_date && `Due: ${space.due_date}`,
      space.origin && `Origin: ${space.origin}`,
      tags.length > 0 && `Tags: ${tags.join(', ')}`,
      categories.length > 0 && `Categories: ${categories.join(', ')}`,
      `Created: ${space.created_at}`,
    ].filter(Boolean);

    out.push('---', '', `# ${space.title}`, '', ...bullet(meta), '');

    const own = (blocksBySpace.get(space.id) || []).sort((a, b) => a.position - b.position);
    if (own.length === 0) {
      out.push('_(no entries)_', '');
    } else {
      own.forEach((block) => {
        const properties = parse(block.properties, {});
        const blockCategories = properties.categories || [];
        out.push(
          `## ${block.type}${blockCategories.length > 0 ? ` _(${blockCategories.join(', ')})_` : ''}`,
          '',
          ...renderBlock({ ...block, content: parse(block.content, {}) }, spaceTitleById),
          ''
        );
      });
    }

    const ownWorkspaces = workspaces.filter((workspace) => workspace.space_id === space.id);
    const ownProjects = projects.filter((project) => project.space_id === space.id);
    if (ownWorkspaces.length > 0 || ownProjects.length > 0) {
      out.push(
        '## Structure',
        '',
        ...bullet([
          ownWorkspaces.length > 0 && `Workspaces: ${ownWorkspaces.map((w) => w.name).join(', ')}`,
          ownProjects.length > 0 && `Projects: ${ownProjects.map((p) => p.name).join(', ')}`,
        ]),
        ''
      );
    }

    const ownTrail = trail
      .filter((entry) => entry.space_id === space.id)
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    if (ownTrail.length > 0) {
      out.push('## Trail', '');
      ownTrail.forEach((entry) => {
        out.push(`- **${entry.created_at}** (${entry.kind}) ${entry.summary || ''}`);
        if (entry.note) out.push(`  - ${entry.note}`);
      });
      out.push('');
    }
  });

  return out.join('\n');
}
