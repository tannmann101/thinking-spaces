import { describe, it, expect } from 'vitest';
import { blockRegistry, CONFIDENCE_LEVELS, TEXT_ATTRIBUTION_TAGS, MEDIA_TYPES } from './blocks.js';
import { viewRegistry } from './views.js';

const ALL_KEYS = new Set([...Object.keys(blockRegistry), ...Object.keys(viewRegistry)]);
const VALID_FAMILIES = ['general', 'work', 'time', 'mapping'];

describe('blockRegistry', () => {
  it('gives every entry the required shape: label, description, family, icon, component', () => {
    Object.entries(blockRegistry).forEach(([key, entry]) => {
      expect(entry.label, `${key}.label`).toEqual(expect.any(String));
      expect(entry.description, `${key}.description`).toEqual(expect.any(String));
      expect(VALID_FAMILIES, `${key}.family`).toContain(entry.family);
      expect(entry.icon, `${key}.icon`).toEqual(expect.any(String));
      expect(entry.component, `${key}.component`).toBeTruthy();
    });
  });

  it('gives every entry a demoBlock whose own type matches its registry key', () => {
    Object.entries(blockRegistry).forEach(([key, entry]) => {
      expect(entry.demoBlock.type, `${key}.demoBlock.type`).toBe(key);
    });
  });

  it('only ever names a real Block or View key in worksWith', () => {
    Object.entries(blockRegistry).forEach(([key, entry]) => {
      (entry.worksWith || []).forEach((target) => {
        expect(ALL_KEYS.has(target), `${key}.worksWith includes unknown key "${target}"`).toBe(true);
      });
    });
  });

  it('assigns family "work" to exactly the eleven current Work Types', () => {
    const workKeys = Object.entries(blockRegistry)
      .filter(([, entry]) => entry.family === 'work')
      .map(([key]) => key)
      .sort();
    expect(workKeys).toEqual(
      ['analysis', 'assessment', 'deduction', 'definition', 'demonstration', 'formulation', 'hypothesis', 'implication', 'insight', 'objection', 'question'].sort()
    );
  });

  it('assigns family "time" to Milestone and Session', () => {
    const timeKeys = Object.entries(blockRegistry)
      .filter(([, entry]) => entry.family === 'time')
      .map(([key]) => key)
      .sort();
    expect(timeKeys).toEqual(['milestone', 'session']);
  });
});

describe('shared constant lists', () => {
  it('CONFIDENCE_LEVELS has exactly the five levels, least to most confident', () => {
    expect(CONFIDENCE_LEVELS).toEqual(['questioned', 'tentative', 'moderate', 'solid', 'certain']);
  });

  it('TEXT_ATTRIBUTION_TAGS has exactly the four attribution tags', () => {
    expect(TEXT_ATTRIBUTION_TAGS).toEqual(['quote', 'paraphrase', 'reflection', 'inference']);
  });

  it('MEDIA_TYPES has exactly the five media kinds', () => {
    expect(MEDIA_TYPES).toEqual(['image', 'link', 'document', 'audio', 'sketch']);
  });
});

describe('viewRegistry', () => {
  it('gives every entry the required shape: label, description, icon, appliesTo, component', () => {
    Object.entries(viewRegistry).forEach(([key, entry]) => {
      expect(entry.label, `${key}.label`).toEqual(expect.any(String));
      expect(entry.description, `${key}.description`).toEqual(expect.any(String));
      expect(entry.icon, `${key}.icon`).toEqual(expect.any(String));
      expect(typeof entry.appliesTo, `${key}.appliesTo`).toBe('function');
      expect(entry.component, `${key}.component`).toBeTruthy();
    });
  });

  it('only ever names a real Block or View key in worksWith', () => {
    Object.entries(viewRegistry).forEach(([key, entry]) => {
      (entry.worksWith || []).forEach((target) => {
        expect(ALL_KEYS.has(target), `${key}.worksWith includes unknown key "${target}"`).toBe(true);
      });
    });
  });

  it('every list-based View\'s appliesTo actually accepts its own demoBlock', () => {
    // A self-consistency guard: if a demoBlock is edited without
    // keeping appliesTo's own matching logic in mind, the Tools catalog
    // would demo a View that claims not to apply to the very data it's
    // demoing. Graph is excluded -- its appliesTo always returns false
    // by design (see the comment in views.js), and it takes demoProps,
    // not a demoBlock.
    Object.entries(viewRegistry).forEach(([key, entry]) => {
      if (!entry.demoBlock) return;
      expect(entry.appliesTo(entry.demoBlock), `${key}.appliesTo(${key}.demoBlock)`).toBe(true);
    });
  });

  it('Graph deliberately never applies to any single block', () => {
    expect(viewRegistry.graph.appliesTo({})).toBe(false);
  });

  it('Timeline does not apply to a List with no dated items', () => {
    const undated = { type: 'list', content: { items: [{ id: '1', text: 'x' }] } };
    expect(viewRegistry.timeline.appliesTo(undated)).toBe(false);
  });

  it('Progress does not apply to a List with no checkbox items', () => {
    const uncheckable = { type: 'list', content: { items: [{ id: '1', text: 'x' }] } };
    expect(viewRegistry.progress.appliesTo(uncheckable)).toBe(false);
  });

  it('Streak requires both a date and a checkbox on at least one item', () => {
    const dateOnly = { type: 'list', content: { items: [{ id: '1', text: 'x', date: '2024-01-01' }] } };
    const checkboxOnly = { type: 'list', content: { items: [{ id: '1', text: 'x', checkbox: true }] } };
    expect(viewRegistry.streak.appliesTo(dateOnly)).toBe(false);
    expect(viewRegistry.streak.appliesTo(checkboxOnly)).toBe(false);
  });

  it('no View applies to a non-List block', () => {
    const textBlock = { type: 'text', content: { lines: [] } };
    Object.entries(viewRegistry).forEach(([key, entry]) => {
      if (key === 'graph') return; // never applies to any block, by design
      expect(entry.appliesTo(textBlock), key).toBe(false);
    });
  });
});
