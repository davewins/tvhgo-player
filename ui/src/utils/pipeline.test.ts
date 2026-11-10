import { describe, expect, test } from 'vitest';
import { summary, workFor } from './pipeline';

import { PipelineStatus } from '@/clients/api/api.types';

const status: PipelineStatus = {
  available: true,
  current: {
    id: 'a',
    title: 'A',
    step: 'convert_mp4',
    percent: 41.2,
    since: 1,
  },
  queue: [
    { id: 'a', title: 'A', steps: ['convert_mp4'] },
    { id: 'b', title: 'B', steps: ['convert_mp4'] },
  ],
  failed: [
    {
      id: 'c',
      title: 'C',
      step: 'convert_mp4',
      detail: 'x',
      attempts: 5,
      retry_at: null,
    },
    {
      id: 'd',
      title: 'D',
      step: 'convert_mp4',
      detail: 'x',
      attempts: 1,
      retry_at: 99,
    },
  ],
};

describe('workFor', () => {
  test('converting, queued, failed and nothing', () => {
    expect(workFor(status, 'a')).toEqual({
      kind: 'converting',
      step: 'convert_mp4',
      percent: 41.2,
    });
    expect(workFor(status, 'b')).toEqual({ kind: 'queued' });
    expect(workFor(status, 'c')).toEqual({ kind: 'failed', giveUp: true });
    expect(workFor(status, 'd')).toEqual({ kind: 'failed', giveUp: false });
    expect(workFor(status, 'zzz')).toBeNull();
    expect(workFor(null, 'a')).toBeNull();
  });
});

describe('summary', () => {
  test('does not count the running one as waiting', () => {
    expect(summary(status)).toMatchObject({
      waiting: 1,
      failed: 2,
      idle: false,
    });
  });
  test('idle when nothing to report', () => {
    expect(
      summary({ available: true, current: null, queue: [], failed: [] })?.idle
    ).toBe(true);
    expect(summary(null)).toBeNull();
  });
});
