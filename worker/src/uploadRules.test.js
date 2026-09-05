import { describe, it, expect } from 'vitest';
import {
  MAX_UPLOAD_BYTES,
  extensionOf,
  isAllowedFile,
  storedFilenameFor,
  isValidStoredFilename,
} from './uploadRules.js';

// Mirrored verbatim from backend/test/uploadRules.test.js, since the module
// itself is a verbatim copy on both sides -- if these ever diverge, a
// file the local app accepts could be rejected by the live site.

describe('isAllowedFile', () => {
  it('accepts a type on the allowlist', () => {
    expect(isAllowedFile('application/pdf', 'paper.pdf')).toBe(true);
    expect(isAllowedFile('image/png', 'shot.png')).toBe(true);
  });

  it('rejects a type that is not', () => {
    expect(isAllowedFile('application/x-msdownload', 'thing.exe')).toBe(false);
    expect(isAllowedFile('application/zip', 'archive.zip')).toBe(false);
  });

  // The whole reason the extension fallback exists: markdown and .txt
  // arrive with an unreliable (sometimes empty) mimetype.
  it('falls back to the extension for markdown and text', () => {
    expect(isAllowedFile('', 'notes.md')).toBe(true);
    expect(isAllowedFile('', 'notes.markdown')).toBe(true);
    expect(isAllowedFile('application/octet-stream', 'notes.txt')).toBe(true);
  });

  it('does not extend that fallback to anything else', () => {
    expect(isAllowedFile('', 'thing.exe')).toBe(false);
    expect(isAllowedFile('', 'noextension')).toBe(false);
  });
});

describe('storedFilenameFor', () => {
  const uuid = '11111111-2222-3333-4444-555555555555';

  it('keeps the extension but never the name', () => {
    expect(storedFilenameFor('My Report.PDF', uuid)).toBe(`${uuid}.pdf`);
  });

  it('handles a file with no extension', () => {
    expect(storedFilenameFor('README', uuid)).toBe(uuid);
  });

  // Nothing about the name a person picked becomes part of the key,
  // which is what makes traversal a non-question rather than a defence.
  it('discards path separators hidden in the original name', () => {
    expect(storedFilenameFor('../../etc/passwd', uuid)).toBe(uuid);
    expect(storedFilenameFor('..\\..\\secrets.txt', uuid)).toBe(`${uuid}.txt`);
  });

  it('caps an absurdly long extension', () => {
    expect(storedFilenameFor(`x.${'a'.repeat(50)}`, uuid).length).toBeLessThanOrEqual(uuid.length + 10);
  });
});

describe('isValidStoredFilename', () => {
  it('accepts a name this module would generate', () => {
    expect(isValidStoredFilename('11111111-2222-3333-4444-555555555555.pdf')).toBe(true);
    expect(isValidStoredFilename('11111111-2222-3333-4444-555555555555')).toBe(true);
  });

  it('rejects anything it would not have', () => {
    expect(isValidStoredFilename('../../package.json')).toBe(false);
    expect(isValidStoredFilename('secrets.txt')).toBe(false);
    expect(isValidStoredFilename('')).toBe(false);
  });
});

describe('MAX_UPLOAD_BYTES', () => {
  it('is 25 MB, well under the Workers request-body limit', () => {
    expect(MAX_UPLOAD_BYTES).toBe(25 * 1024 * 1024);
  });
});

describe('extensionOf', () => {
  it('lowercases, and returns empty for a name without one', () => {
    expect(extensionOf('Thing.JPEG')).toBe('.jpeg');
    expect(extensionOf('thing')).toBe('');
  });
});
