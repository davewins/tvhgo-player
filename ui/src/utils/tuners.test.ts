import {
  browserName,
  heldMuxes,
  isFull,
  joinNames,
  viewerLabel,
} from './tuners';
import { describe, expect, test } from 'vitest';

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

test('viewers are described for people', () => {
  const iphone =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  const chrome =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
  expect(browserName(iphone)).toBe('Safari on iPhone');
  expect(browserName(chrome)).toBe('Chrome on Windows');
  expect(viewerLabel({ client: `tvhgo: ${iphone}` })).toBe('Safari on iPhone');
  expect(
    viewerLabel({ client: 'Lavf/62.1', username: 'jellyfin', host: '10.0.0.4' })
  ).toBe('Jellyfin (10.0.0.4)');
  expect(viewerLabel({})).toBe('');
});
