import { describe, it, expect } from 'vitest';
import { mergeFieldsWithFieldClocks } from '../src/merge.js';

describe('mergeFieldsWithFieldClocks', () => {
  it('keeps both fields when concurrent edits touch different fields', () => {
    const client = {
      id: 'EMP1',
      name: 'Ada',
      fieldClocks: { name: 2 },
      vectorClock: { client_a: 2 }
    };
    const server = {
      id: 'EMP1',
      phone: '+91 99999 00001',
      fieldClocks: { phone: 3 },
      vectorClock: { client_b: 3 }
    };

    const merged = mergeFieldsWithFieldClocks(client, server);

    expect(merged.name).toBe('Ada');
    expect(merged.phone).toBe('+91 99999 00001');
    expect(merged.fieldClocks.name).toBe(2);
    expect(merged.fieldClocks.phone).toBe(3);
  });

  it('picks the higher field clock when the same field diverges', () => {
    const client = {
      id: 'EMP1',
      name: 'Client Name',
      fieldClocks: { name: 5 },
      vectorClock: { client_a: 5 }
    };
    const server = {
      id: 'EMP1',
      name: 'Server Name',
      fieldClocks: { name: 3 },
      vectorClock: { client_b: 3 }
    };

    const merged = mergeFieldsWithFieldClocks(client, server);

    expect(merged.name).toBe('Client Name');
    expect(merged.fieldClocks.name).toBe(6);
  });

  it('uses deterministic tie-break when field clocks are equal', () => {
    const client = {
      id: 'EMP1',
      name: 'Beta',
      fieldClocks: { name: 2 },
      vectorClock: { client_a: 2 }
    };
    const server = {
      id: 'EMP1',
      name: 'Alpha',
      fieldClocks: { name: 2 },
      vectorClock: { client_b: 2 }
    };

    const merged = mergeFieldsWithFieldClocks(client, server);

    expect(merged.name).toBe('Beta');
    expect(merged.fieldClocks.name).toBe(3);
  });
});
