import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { getChapters, getPlayback } from '@/clients/api/api';

import Player from './Player';

vi.mock('@/clients/api/api', async (orig) => ({
  ...(await orig<typeof import('@/clients/api/api')>()),
  getChapters: vi.fn(),
  getPlayback: vi.fn(),
  getLiveQualities: vi.fn().mockResolvedValue([]),
  preparePlayback: vi.fn(),
}));

let time = 0;

beforeEach(() => {
  time = 0;
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
