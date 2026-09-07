import { describe, it, expect } from 'vitest';
import {
  workspaceKindRegistry,
  WORKSPACE_KIND_ORDER,
  getWorkspaceKind,
} from './workspaceKinds.js';
import { blockRegistry } from './blocks.js';
import { THEME_ACCENTS, THEME_SHAPES, THEME_DENSITIES, THEME_TYPEFACES } from '../theme/itemTheme.js';

const kinds = Object.entries(workspaceKindRegistry);

describe('workspaceKindRegistry: shape', () => {
  it('gives every kind the fields the catalog and the page both need', () => {
    kinds.forEach(([key, kind]) => {
      expect(kind.key, `${key}.key`).toBe(key);
      expect(kind.label, `${key}.label`).toEqual(expect.any(String));
      expect(kind.icon, `${key}.icon`).toEqual(expect.any(String));
      expect(kind.description, `${key}.description`).toEqual(expect.any(String));
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
  // silently render an unusable picker, and nothing else would complain.
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

  it('puts every kind in the catalog order exactly once', () => {
    expect([...WORKSPACE_KIND_ORDER].sort()).toEqual(Object.keys(workspaceKindRegistry).sort());
  });

});

describe('getWorkspaceKind', () => {
  it('resolves a known key and returns null for anything else', () => {
    expect(getWorkspaceKind('analyst').label).toBe('Analyst');
    expect(getWorkspaceKind(null)).toBeNull();
    expect(getWorkspaceKind('not-a-kind')).toBeNull();
  });
});

