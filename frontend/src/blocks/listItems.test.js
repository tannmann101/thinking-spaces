import { describe, it, expect } from 'vitest';
import { CONFIDENCE_CYCLE, buildNewItem } from './listItems.js';

describe('CONFIDENCE_CYCLE', () => {
  it('matches the five confidence levels, least to most confident', () => {
    expect(CONFIDENCE_CYCLE).toEqual(['questioned', 'tentative', 'moderate', 'solid', 'certain']);
  });
});

describe('buildNewItem', () => {
  it('creates a plain item with just id and text when the list has no shape yet', () => {
    const item = buildNewItem('hello', [], false);
    expect(item).toEqual({ id: expect.any(String), text: 'hello' });
  });

  it('infers a checkbox field from an existing item', () => {
    const item = buildNewItem('new', [{ id: '1', text: 'x', checkbox: true }], false);
    expect(item.checkbox).toBe(false);
  });

  it('infers a number field from an existing item', () => {
    const item = buildNewItem('new', [{ id: '1', text: 'x', number: 42 }], false);
    expect(item.number).toBe(0);
  });

  it('infers a date field from an existing item, using today\'s date', () => {
    const item = buildNewItem('new', [{ id: '1', text: 'x', date: '2020-01-01' }], false);
    expect(item.date).toBe(new Date().toISOString().slice(0, 10));
  });

  it('infers a reviewBy field from an existing item', () => {
    const item = buildNewItem('new', [{ id: '1', text: 'x', reviewBy: '2020-01-01' }], false);
    expect(item.reviewBy).toBe(new Date().toISOString().slice(0, 10));
  });

  it('infers a flagged field from an existing item', () => {
    const item = buildNewItem('new', [{ id: '1', text: 'x', flagged: true }], false);
    expect(item.flagged).toBe(false);
  });

  it('gives every item in a Skeleton lane a confidence field, even with no existing items', () => {
    const item = buildNewItem('new', [], true);
    expect(item.confidence).toBe('tentative');
  });

  it('infers confidence from an existing non-Skeleton item that already has one', () => {
    const item = buildNewItem('new', [{ id: '1', text: 'x', confidence: 'solid' }], false);
    expect(item.confidence).toBe('tentative');
  });

  it('does not add fields the existing item does not have', () => {
    const item = buildNewItem('new', [{ id: '1', text: 'x' }], false);
    expect(item).toEqual({ id: expect.any(String), text: 'new' });
  });

  it('uses shapeOverride to establish a shape for the very first item in an empty list', () => {
    const item = buildNewItem('first', [], false, { checkbox: true, number: true });
    expect(item.checkbox).toBe(false);
    expect(item.number).toBe(0);
  });

  it('ignores shapeOverride once real items already exist', () => {
    const item = buildNewItem('new', [{ id: '1', text: 'x', checkbox: false }], false, { number: true });
    expect(item.checkbox).toBe(false);
    expect(item.number).toBeUndefined();
  });

  it('gives every item a unique id', () => {
    const a = buildNewItem('a', [], false);
    const b = buildNewItem('b', [], false);
    expect(a.id).not.toBe(b.id);
  });
});
