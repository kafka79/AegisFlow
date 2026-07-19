import { describe, it, expect, vi } from 'vitest';
import { MockServer } from '../src/server.js';

describe('Minimal', () => {
  beforeEach(async () => {
    await MockServer.init();
  });

  it('just works', () => {
    expect(1).toBe(1);
  });
});
