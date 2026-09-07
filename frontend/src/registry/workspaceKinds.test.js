import { describe, it, expect } from 'vitest';
import {
  workspaceKindRegistry,
  WORKSPACE_KIND_ORDER,
  getWorkspaceKind,
  groupBlocksByKindSection,
} from './workspaceKinds.js';
import { blockRegistry } from './blocks.js';
import { THEME_ACCENTS, THEME_SHAPES, THEME_DENSITIES, THEME_TYPEFACES } from '../theme/itemTheme.js';
import { WORK_LABELS } from '../blocks/workLabels.js';

const kinds = Object.entries(workspaceKindRegistry);

describe('workspaceKindRegistry: shape', () => {
  it('gives every kind the fields the catalog and the page both need', () => {
    kinds.forEach(([key, kind]) => {
      expect(kind.key, `${key}.key`).toBe(key);
      expect(kind.label, `${key}.label`).toEqual(expect.any(String));
      expect(kind.icon, `${key}.icon`).toEqual(expect.any(String));
      expect(kind.description, `${key}.description`).toEqual(expect.any(String));
      expect(kind.sections.length, `${key}.sections`).toBeGreaterThan(0);
      expect(kind.leadTools.length, `${key}.leadTools`).toBeGreaterThan(0);
    });
  });

  it('gives every kind a theme the app can actually draw', () => {
    kinds.forEach(([key, kind]) => {
      expect(THEME_ACCENTS, `${key}.theme.accent`).toContain(kind.theme.accent);
      expect(THEME_SHAPES, `${key}.theme.shape`).toContain(kind.theme.shape);
      expect(THEME_DENSITIES, `${key}.theme.density`).toContain(kind.theme.density);
      expect(THEME_TYPEFACES, `${key}.theme.typeface`).toContain(kind.theme.typeface);
    });
  });
});

describe('workspaceKindRegistry: references resolve', () => {
  // The real drift guard. A kind naming a Tool that does not exist would
  // silently render an empty section or an unusable picker, and nothing
  // else in the app would complain.
  it('names only real registered Tools in every section', () => {
    kinds.forEach(([key, kind]) => {
      kind.sections.forEach((section) => {
        section.types.forEach((type) => {
          expect(blockRegistry[type], `${key}: section "${section.name}" names unknown Tool "${type}"`).toBeTruthy();
        });
      });
    });
  });

  it('names only real registered Tools in leadTools', () => {
    kinds.forEach(([key, kind]) => {
      kind.leadTools.forEach((type) => {
        expect(blockRegistry[type], `${key}: leadTools names unknown Tool "${type}"`).toBeTruthy();
      });
    });
  });

  it('starts every kind with blocks of real registered types', () => {
    kinds.forEach(([key, kind]) => {
      (kind.starterBlocks || []).forEach((spec) => {
        expect(blockRegistry[spec.type], `${key}: starterBlocks names unknown Tool "${spec.type}"`).toBeTruthy();
      });
    });
  });

  // The companion to the leadTools guard below: a kind that seeds a Tool
  // none of its own sections claims would drop that block straight into
  // "Also here" the moment the Workspace was created, which reads as a
  // bug in the kind rather than a deliberate arrangement.
  it('files every starter block into one of the kind own sections', () => {
    kinds.forEach(([key, kind]) => {
      // Asked through the real grouping function rather than by
      // re-implementing its rule here -- a section matches an entry
      // type, and for a Claim also its own `kind` label, and a test
      // carrying its own copy of that would be free to drift from it.
      const specs = (kind.starterBlocks || []).map((spec, index) => ({ ...spec, id: `starter-${index}` }));
      const groups = groupBlocksByKindSection(kind, specs);
      const alsoHere = groups.find((group) => group.name === 'Also here');
      expect(
        alsoHere?.blocks.map((block) => block.content?.kind || block.type) || [],
        `${key}: starter blocks that belong to no section would land in "Also here"`
      ).toEqual([]);
    });
  });

  it('puts every kind in the catalog order exactly once', () => {
    expect([...WORKSPACE_KIND_ORDER].sort()).toEqual(Object.keys(workspaceKindRegistry).sort());
  });

  it('covers each kind own lead Tools somewhere in its own sections, so a lead Tool always has a home', () => {
    kinds.forEach(([key, kind]) => {
      const sectioned = new Set(kind.sections.flatMap((section) => section.types));
      kind.leadTools.forEach((type) => {
        if (type === 'claim') {
          // A Claim is sorted by its `kind` label, not by being a Claim,
          // so what has to have a home is at least one kind of claim --
          // an unlabelled one landing in "Also here" is the mechanism
          // working, not a gap in the arrangement.
          const namesAKindOfClaim = [...sectioned].some((name) => name in WORK_LABELS && name !== 'claim');
          expect(namesAKindOfClaim, `${key}: leads with Claim but no section sorts one`).toBe(true);
          return;
        }
        expect(sectioned.has(type), `${key}: lead Tool "${type}" belongs to no section`).toBe(true);
      });
    });
  });
});

describe('getWorkspaceKind', () => {
  it('resolves a known key and returns null for anything else', () => {
    expect(getWorkspaceKind('analyst').label).toBe('Analyst');
    expect(getWorkspaceKind(null)).toBeNull();
    expect(getWorkspaceKind('not-a-kind')).toBeNull();
  });
});

describe('groupBlocksByKindSection', () => {
  const kind = workspaceKindRegistry.etymology;

  it('returns null for an unkinded Workspace, which keeps its plain flat feed', () => {
    expect(groupBlocksByKindSection(null, [{ id: 'b1', type: 'text' }])).toBeNull();
  });

  it('files each block into the first section that claims its type', () => {
    const groups = groupBlocksByKindSection(kind, [
      { id: 'b1', type: 'wordEvolution' },
      { id: 'b2', type: 'reference' },
    ]);
    expect(groups[0].blocks.map((b) => b.id)).toEqual(['b1']);
    expect(groups.find((g) => g.name === 'Sources').blocks.map((b) => b.id)).toEqual(['b2']);
  });

  it('never files one block into two sections', () => {
    const groups = groupBlocksByKindSection(kind, [{ id: 'b1', type: 'list' }]);
    const appearances = groups.flatMap((g) => g.blocks).filter((b) => b.id === 'b1');
    expect(appearances).toHaveLength(1);
  });

  it('keeps an unexpected Tool visible under "Also here" rather than dropping it', () => {
    const groups = groupBlocksByKindSection(kind, [{ id: 'b1', type: 'milestone' }]);
    const leftover = groups[groups.length - 1];
    expect(leftover.name).toBe('Also here');
    expect(leftover.blocks.map((b) => b.id)).toEqual(['b1']);
  });

  it('adds no "Also here" group when every block belongs to a section', () => {
    const groups = groupBlocksByKindSection(kind, [{ id: 'b1', type: 'wordEvolution' }]);
    expect(groups.map((g) => g.name)).not.toContain('Also here');
  });

  it('keeps empty sections, so the kind still frames what belongs there', () => {
    const groups = groupBlocksByKindSection(kind, []);
    expect(groups).toHaveLength(kind.sections.length);
    expect(groups.every((g) => g.blocks.length === 0)).toBe(true);
  });
});
