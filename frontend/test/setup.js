// Runs once before every test file: extends Vitest's expect() with
// jest-dom's DOM-specific matchers (toBeInTheDocument, toHaveTextContent,
// etc.) and cleans up whatever the previous test rendered so tests never
// leak DOM nodes into each other.
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

afterEach(() => {
  cleanup();
});
