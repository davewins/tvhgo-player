import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { getChapters, getPlayback, getWatchProgress } from '@/clients/api/api';

import Player from './Player';

vi.mock('@/clients/api/api', async (orig) => ({
  ...(await orig<typeof import('@/clients/api/api')>()),
  getChapters: vi.fn(),
  getPlayback: vi.fn(),
  getWatchProgress: vi.fn().mockResolvedValue([]),
  clearWatchProgress: vi.fn().mockResolvedValue(undefined),
  getLiveQualities: vi.fn().mockResolvedValue([]),
  preparePlayback: vi.fn(),
}));

let time = 0;
const fetchMock = vi.fn().mockResolvedValue({});

beforeEach(() => {
  time = 0;
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(getWatchProgress).mockResolvedValue([]);
  // jsdom has no media playback: stand in for the bits the player uses
  Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', {
    configurable: true,
    get: () => time,
    set: (v: number) => {
      time = v;
    },
  });
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  HTMLMediaElement.prototype.pause = vi.fn();
  HTMLMediaElement.prototype.load = vi.fn();
  vi.mocked(getPlayback).mockResolvedValue({
    status: 'ready',
    progress: 100,
    canConvert: true,
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const chapters = [
  { start: 0, end: 36, title: 'Commercial', advert: true },
  { start: 36, end: 663, title: 'Part 1', advert: false },
  { start: 663, end: 917, title: 'Commercial', advert: true },
  { start: 917, end: 1800, title: 'Part 2', advert: false },
];

const open = async () => {
  vi.mocked(getChapters).mockResolvedValue(chapters);
  const doc = render(
    <Player
      visible
      onClose={() => undefined}
      title="Emmerdale"
      recordingId="r1"
    />
  );
  await waitFor(() => expect(getChapters).toHaveBeenCalledWith('r1'));
  await new Promise((r) => setTimeout(r, 0)); // let the chapters land in state
  return doc;
};

const at = (doc: ReturnType<typeof render>, seconds: number) => {
  time = seconds;
  fireEvent.timeUpdate(
    doc.container.querySelector('video') as HTMLVideoElement
  );
};

test('no button in the programme', async () => {
  const doc = await open();
  at(doc, 300);
  expect(doc.queryByTestId('skip-ad-break')).toBeNull();
});

test('the button appears inside an advert break', async () => {
  const doc = await open();
  at(doc, 700);
  expect(doc.getByTestId('skip-ad-break')).toBeTruthy();
});

test('the lead-in at the very start counts as a break', async () => {
  const doc = await open();
  at(doc, 0.1);
  expect(doc.getByTestId('skip-ad-break')).toBeTruthy();
});

test('clicking it jumps to the end of the break and the button goes', async () => {
  const doc = await open();
  at(doc, 700);
  fireEvent.click(doc.getByTestId('skip-ad-break'));
  expect(time).toBe(917);
  expect(doc.queryByTestId('skip-ad-break')).toBeNull();
});

test('it goes away when the break is nearly over, and when the programme resumes', async () => {
  const doc = await open();
  at(doc, 700);
  expect(doc.getByTestId('skip-ad-break')).toBeTruthy();
  at(doc, 916.5);
  expect(doc.queryByTestId('skip-ad-break')).toBeNull();
  at(doc, 950);
  expect(doc.queryByTestId('skip-ad-break')).toBeNull();
});

test('a recording without chapters, or a failed lookup, never shows it', async () => {
  vi.mocked(getChapters).mockRejectedValue(new Error('nope'));
  const doc = render(
    <Player visible onClose={() => undefined} title="x" recordingId="r2" />
  );
  await waitFor(() => expect(getChapters).toHaveBeenCalled());
  at(doc, 10);
  expect(doc.queryByTestId('skip-ad-break')).toBeNull();
});

const progress = (position: number, duration = 1800) => [
  { recordingId: 'r1', position, duration, updatedAt: 0 },
];

test('resumes a little before where the last viewing stopped, and says so', async () => {
  vi.mocked(getWatchProgress).mockResolvedValue(progress(900));
  const doc = await open();
  const video = doc.container.querySelector('video') as HTMLVideoElement;
  fireEvent.loadedMetadata(video);
  expect(time).toBe(895);
  expect(doc.getByTestId('resume-banner')).toBeTruthy();
});

test('"start from beginning" goes back to 0', async () => {
  vi.mocked(getWatchProgress).mockResolvedValue(progress(900));
  const doc = await open();
  const video = doc.container.querySelector('video') as HTMLVideoElement;
  fireEvent.loadedMetadata(video);
  fireEvent.click(doc.getByText(/beginning|player_start_over/i));
  expect(time).toBe(0);
  expect(doc.queryByTestId('resume-banner')).toBeNull();
});

test('a recording watched to the end starts from the top, without a banner', async () => {
  vi.mocked(getWatchProgress).mockResolvedValue(progress(1790));
  const doc = await open();
  fireEvent.loadedMetadata(
    doc.container.querySelector('video') as HTMLVideoElement
  );
  expect(time).toBe(0);
  expect(doc.queryByTestId('resume-banner')).toBeNull();
});

test('the break bar under the video shows the ad breaks and seeks when used', async () => {
  const doc = await open();
  const video = doc.container.querySelector('video') as HTMLVideoElement;
  Object.defineProperty(video, 'duration', { configurable: true, value: 1800 });
  fireEvent.durationChange(video);
  at(doc, 100);
  await waitFor(() => expect(doc.getByTestId('break-bar')).toBeTruthy());
  expect(doc.getAllByTestId('break-segment')).toHaveLength(2);

  fireEvent.click(doc.getByText(/break_next/));
  expect(time).toBe(663);
  at(doc, 700);
  fireEvent.click(doc.getByText(/break_prev/));
  expect(time).toBe(663);
});

test('no break bar for a recording without ad breaks', async () => {
  vi.mocked(getChapters).mockResolvedValue([]);
  const doc = render(
    <Player visible onClose={() => undefined} title="Show" recordingId="r1" />
  );
  await waitFor(() => expect(getChapters).toHaveBeenCalled());
  await new Promise((r) => setTimeout(r, 0));
  expect(doc.queryByTestId('break-bar')).toBeNull();
});
