import { describe, expect, test } from 'vitest';
import { heldMuxes, isFull, joinNames } from './tuners';

import { TunerStatus } from '@/clients/api/api.types';

const status = (busy: number): TunerStatus => ({
  available: true,
  total: 2,
  busy,
  blocked: [],
  tuners: [
    {
      name: 'a',
      mux: '482MHz in Freeview Malvern',
      busy: busy > 0,
      users: [
        { title: 'EastEnders', channel: 'BBC ONE HD', kind: 'recording' },
      ],
    },
    {
      name: 'b',
      mux: busy > 1 ? '498MHz in Freeview Malvern' : '',
      busy: busy > 1,
      users: [],
    },
  ],
});

describe('tuners', () => {
  test('full only when every tuner is busy', () => {
    expect(isFull(null)).toBe(false);
    expect(isFull(status(1))).toBe(false);
    expect(isFull(status(2))).toBe(true);
  });
  test('names read naturally', () => {
    expect(joinNames(['A'])).toBe('A');
    expect(joinNames(['A', 'B'])).toBe('A & B');
    expect(joinNames(['A', 'B', 'C', 'A'])).toBe('A, B & C');
    expect(joinNames([])).toBe('');
  });
  test('held multiplexes', () => {
    expect(heldMuxes(status(2))).toBe('482MHz and 498MHz');
    expect(heldMuxes(status(1))).toBe('482MHz');
  });
});
