import { describe, it, expect } from 'vitest';
import { normalizeTextContent, normalizeWorkContent } from '../normalize.js';

describe('normalizeTextContent', () => {
  it('leaves already-shaped {lines} content untouched', () => {
    const content = { lines: [{ id: 'a', text: 'hi', tag: null }] };
    expect(normalizeTextContent(content)).toBe(content);
  });

  it('splits an old {tag, text} shape into one line per newline', () => {
    const result = normalizeTextContent({ tag: 'quote', text: 'first line\nsecond line' });
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0]).toMatchObject({ text: 'first line', tag: 'quote' });
    expect(result.lines[1]).toMatchObject({ text: 'second line', tag: 'quote' });
    expect(result.lines[0].id).toBeTruthy();
    expect(result.lines[1].id).not.toBe(result.lines[0].id);
  });

  it('gives an empty/missing text one blank line rather than zero lines', () => {
    const result = normalizeTextContent({});
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].text).toBe('');
    expect(result.lines[0].tag).toBeNull();
  });

  it('defaults a missing tag to null on every produced line', () => {
    const result = normalizeTextContent({ text: 'no tag here' });
    expect(result.lines[0].tag).toBeNull();
  });
});

describe('normalizeWorkContent', () => {
  it('leaves already-shaped {support} content untouched', () => {
    const content = { statement: 'x', support: [{ id: 'a', text: 'y' }], confidence: 'solid' };
    expect(normalizeWorkContent(content)).toBe(content);
  });

  it('upgrades an old {rationale} blob into one support point', () => {
    const result = normalizeWorkContent({ statement: 'Vendor switch is not worth it', rationale: 'Costs outweigh savings' });
    expect(result.statement).toBe('Vendor switch is not worth it');
    expect(result.support).toHaveLength(1);
    expect(result.support[0]).toMatchObject({ text: 'Costs outweigh savings' });
    expect(result.support[0].id).toBeTruthy();
    expect(result.confidence).toBe('tentative');
  });

  it('gives a rationale-less block an empty support list, not a missing field', () => {
    const result = normalizeWorkContent({ statement: 'A question with no answer yet' });
    expect(result.support).toEqual([]);
  });

  it('defaults confidence to tentative and statement to an empty string', () => {
    const result = normalizeWorkContent({});
    expect(result.statement).toBe('');
    expect(result.confidence).toBe('tentative');
  });

  it('preserves an explicit confidence level', () => {
    const result = normalizeWorkContent({ rationale: 'x', confidence: 'certain' });
    expect(result.confidence).toBe('certain');
  });
});
