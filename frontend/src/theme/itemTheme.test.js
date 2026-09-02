import { describe, it, expect } from 'vitest';
import {
  THEME_ACCENTS,
  THEME_SHAPES,
  THEME_DENSITIES,
  THEME_TYPEFACES,
  THEME_DIMENSIONS,
  defaultBlockTheme,
  defaultSpaceTheme,
  resolveBlockTheme,
  resolveSpaceTheme,
  themeAttributes,
} from './itemTheme.js';
import { blockRegistry } from '../registry/blocks.js';

describe('itemTheme: the option lists', () => {
  it('every dimension\'s options are drawn from its own exported list', () => {
    expect(THEME_DIMENSIONS.map((d) => d.key)).toEqual(['accent', 'shape', 'density', 'typeface']);
    expect(THEME_DIMENSIONS[0].options).toBe(THEME_ACCENTS);
    expect(THEME_DIMENSIONS[1].options).toBe(THEME_SHAPES);
    expect(THEME_DIMENSIONS[2].options).toBe(THEME_DENSITIES);
    expect(THEME_DIMENSIONS[3].options).toBe(THEME_TYPEFACES);
  });
});

describe('itemTheme: distinct defaults', () => {
  // The whole promise of the defaults half of this system: two Tool
  // types never look alike before anyone themes anything. Checked
  // against the real registry rather than a hardcoded list, so adding a
  // Tool without giving it a distinct look fails here.
  it('gives every registered Block type a theme covering all four dimensions', () => {
    Object.keys(blockRegistry).forEach((type) => {
      const theme = defaultBlockTheme(type);
      expect(THEME_ACCENTS).toContain(theme.accent);
      expect(THEME_SHAPES).toContain(theme.shape);
      expect(THEME_DENSITIES).toContain(theme.density);
      expect(THEME_TYPEFACES).toContain(theme.typeface);
    });
  });

  it('never gives two Block types the same accent-and-shape pairing', () => {
    const pairs = Object.keys(blockRegistry).map((type) => {
      const theme = defaultBlockTheme(type);
      return `${theme.accent}/${theme.shape}`;
    });
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it('falls back to a drawable theme for an unregistered type rather than returning nothing', () => {
    expect(defaultBlockTheme('not-a-real-type')).toEqual({
      accent: 'neutral',
      shape: 'plain',
      density: 'normal',
      typeface: 'body',
    });
  });

  it('gives a Resource, a Synthesis and an ordinary Space distinct default looks', () => {
    const resource = defaultSpaceTheme({ tags: ['resource'] });
    const synthesis = defaultSpaceTheme({ tags: ['synthesis'] });
    const ordinary = defaultSpaceTheme({ tags: [] });
    expect(new Set([resource.accent, synthesis.accent, ordinary.accent]).size).toBe(3);
  });

  it('reads a promoted Synthesis (tagged both) as the Synthesis it actually is', () => {
    expect(defaultSpaceTheme({ tags: ['synthesis', 'resource'] })).toEqual(
      defaultSpaceTheme({ tags: ['synthesis'] })
    );
  });
});

describe('itemTheme: manual override', () => {
  it('layers an override over the default, keeping every dimension it does not set', () => {
    const resolved = resolveBlockTheme({ type: 'assessment', properties: { theme: { accent: 'teal' } } });
    expect(resolved.accent).toBe('teal');
    expect(resolved.shape).toBe(defaultBlockTheme('assessment').shape);
  });

  it('ignores an override value this app cannot draw, rather than rendering nothing', () => {
    const resolved = resolveBlockTheme({ type: 'assessment', properties: { theme: { shape: 'hexagon' } } });
    expect(resolved.shape).toBe(defaultBlockTheme('assessment').shape);
  });

  it('falls back to the default when there is no override at all', () => {
    expect(resolveBlockTheme({ type: 'milestone', properties: {} })).toEqual(defaultBlockTheme('milestone'));
    expect(resolveSpaceTheme({ tags: [], theme: null })).toEqual(defaultSpaceTheme({ tags: [] }));
  });

  it('applies a Space override the same way', () => {
    const resolved = resolveSpaceTheme({ tags: ['resource'], theme: { density: 'roomy' } });
    expect(resolved.density).toBe('roomy');
    expect(resolved.accent).toBe(defaultSpaceTheme({ tags: ['resource'] }).accent);
  });
});

describe('itemTheme: themeAttributes', () => {
  it('turns a resolved theme into the four data attributes the CSS keys off', () => {
    expect(themeAttributes({ accent: 'gold', shape: 'slab', density: 'compact', typeface: 'mono' })).toEqual({
      'data-theme-accent': 'gold',
      'data-theme-shape': 'slab',
      'data-theme-density': 'compact',
      'data-theme-typeface': 'mono',
    });
  });
});
