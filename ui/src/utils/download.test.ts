import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  getPlayback,
  getRecordingUrl,
  preparePlayback,
} from '@/clients/api/api';

import { Recording } from '@/clients/api/api.types';
import { downloadRecording } from './download';

vi.mock('@/clients/api/api');

const rec = { id: 'abc' } as Recording;
let saved: string[] = [];

beforeEach(() => {
  saved = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement
  ) {
    saved.push(this.getAttribute('href') || '');
  });
  vi.mocked(getPlayback).mockReset();
  vi.mocked(preparePlayback).mockReset();
  vi.mocked(getRecordingUrl).mockReturnValue('/api/recordings/abc/stream');
});

afterEach(() => vi.restoreAllMocks());

test('downloads the MP4 when one is ready', async () => {
  vi.mocked(getPlayback).mockResolvedValue({
    status: 'ready',
    progress: 100,
    canConvert: true,
  });
  expect(await downloadRecording(rec)).toBe('mp4');
  expect(saved).toEqual(['/api/recordings/abc/play?download=1']);
  expect(preparePlayback).not.toHaveBeenCalled();
});

test('prepares an MP4 first when there is none, then downloads it', async () => {
  vi.useFakeTimers();
  vi.mocked(getPlayback)
    .mockResolvedValueOnce({ status: 'none', progress: 0, canConvert: true })
    .mockResolvedValue({ status: 'ready', progress: 100, canConvert: true });
  vi.mocked(preparePlayback).mockResolvedValue({
    status: 'converting',
    progress: 10,
    canConvert: true,
  });
  const progress: Array<number | null> = [];
  const p = downloadRecording(rec, (x) => progress.push(x));
  await vi.advanceTimersByTimeAsync(2500);
  expect(await p).toBe('mp4');
  expect(progress[0]).toBe(10);
  expect(progress.at(-1)).toBeNull();
  expect(saved).toEqual(['/api/recordings/abc/play?download=1']);
  vi.useRealTimers();
});

test('falls back to the original file when no MP4 can be made', async () => {
  vi.mocked(getPlayback).mockResolvedValue({
    status: 'none',
    progress: 0,
    canConvert: false,
  });
  vi.mocked(preparePlayback).mockRejectedValue(new Error('409'));
  expect(await downloadRecording(rec)).toBe('original');
  expect(saved).toHaveLength(1);
  expect(saved[0]).toContain('/stream');
});
