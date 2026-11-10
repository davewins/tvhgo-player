import { DVRConfig, EpgEvent } from '@/clients/api/api.types';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { useLoaderData, useNavigate, useRevalidator } from 'react-router-dom';

import { Component as EventView } from './EventView';
import { createAutorec } from '@/clients/api/api';
import { useManageRecordingByEvent } from '@/hooks/recording';
import userEvent from '@testing-library/user-event';

vi.mock('@/hooks/epg');
vi.mock('@/hooks/recording');
vi.mock('@/clients/api/api', async (orig) => ({
  ...(await orig<typeof import('@/clients/api/api')>()),
  createAutorec: vi.fn(),
}));
vi.mock('react-router-dom');

const EVENT_ID = 1;
const RECORDING_ID = 'someRecordingID';

const buildEvent = (dvrUuid?: string): EpgEvent => {
  return {
    audioDesc: true,
    channelId: 'someChannelId',
    channelName: 'Some Channel',
    channelNumber: 1,
    description: 'Some Description',
    endsAt: 0,
    hd: true,
    id: EVENT_ID,
    nextEventId: 2,
    piconId: 1,
    startsAt: 0,
    subtitle: 'Some Subtitle',
    subtitled: true,
    title: 'Some Title',
    widescreen: true,
    dvrUuid,
  };
};

const relatedEvents: EpgEvent[] = [
  {
    audioDesc: true,
    channelId: 'someChannelId',
    channelName: 'Some Channel',
    channelNumber: 1,
    description: 'Some Description 2',
    endsAt: 0,
    hd: true,
    id: 2,
    nextEventId: 3,
    piconId: 1,
    startsAt: 0,
    subtitle: 'Some Subtitle 2',
    subtitled: true,
    title: 'Some Title 2',
    widescreen: true,
  },
  {
    audioDesc: true,
    channelId: 'someChannelId2',
    channelName: 'Some Channel2',
    channelNumber: 1,
    description: 'Some Description 3',
    endsAt: 0,
    hd: true,
    id: 3,
    nextEventId: 4,
    piconId: 1,
    startsAt: 0,
    subtitle: 'Some Subtitle 3',
    subtitled: true,
    title: 'Some Title 3',
    widescreen: true,
  },
];

const buildDvrProfile = (id: string): DVRConfig => {
  return {
    id,
    artwork: {
      allowUnidentifiableBroadcasts: false,
      commandLineOptions: '',
      fetch: true,
    },
    clone: false,
    deleteAfterPlayback: 0,
    enabled: true,
    endPadding: 2,
    epg: {
      autorec: {
        maxCount: 0,
        maxSchedules: 0,
      },
      duplicateHandling: 'foobar',
      epgRunning: true,
      epgUpdateWindow: 0,
      skipCommercials: true,
    },
    file: {
      allowWhitespace: true,
      cleanTitle: true,
      includeChannel: true,
      includeDate: true,
      includeEpisode: true,
      includeSubtitle: true,
      includeTime: true,
      omitTitle: true,
      tagFiles: true,
      windowsCompatibleFilename: false,
    },
    hooks: {
      remove: '',
      start: '',
      stop: '',
    },
    name: 'Some Profile',
    original: false,
    priority: 'high',
    recordingFileRetention: {
      days: 0,
      type: 'forever',
    },
    recordingInfoRetention: {
      days: 0,
      type: 'forever',
    },
    rerecordErrors: 0,
    startPadding: 0,
    storage: {
      cacheScheme: 'none',
      charset: 'utf-8',
      directoryPermissions: '0755',
      filePermissions: '0644',
      maintainFreeSpace: 0,
      maintainUsedSpace: 0,
      pathnameFormat: 'foo$q$bar',
      path: '/foo/bar',
    },
    streamProfileId: 'someStreamProfileId',
    subdirectories: {
      channelSubdir: true,
      daySubdir: true,
      titleSubdir: true,
      tvMoviesSubdirFormat: '',
      tvShowsSubdirFormat: '',
    },
    tunerWarmUpTime: 0,
  };
};

const navigateMock = vi.fn();
const revalidateMock = vi.fn();

beforeEach(() => {
  vi.mocked(useNavigate).mockReturnValue(navigateMock);
  vi.mocked(useRevalidator).mockReturnValue({
    revalidate: revalidateMock,
    state: 'idle',
  });
});

afterEach(() => {
  vi.resetAllMocks();
  cleanup();
});

test('should render without related events', () => {
  vi.mocked(useLoaderData).mockReturnValue([
    buildEvent(),
    [],
    [buildDvrProfile('someProfileId')],
  ]);

  vi.mocked(useManageRecordingByEvent).mockReturnValue({
    pending: false,
    createRecording: async () => {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  const document = render(<EventView />);

  expect(document.asFragment()).toMatchSnapshot();
});

test('should render with recording', () => {
  vi.mocked(useLoaderData).mockReturnValue([
    buildEvent(RECORDING_ID),
    [],
    [buildDvrProfile('someProfileId')],
  ]);

  vi.mocked(useManageRecordingByEvent).mockReturnValue({
    pending: false,
    createRecording: async () => {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  const document = render(<EventView />);

  expect(document.asFragment()).toMatchSnapshot();
});

test('should render with pending button', () => {
  vi.mocked(useLoaderData).mockReturnValue([
    buildEvent(),
    [],
    [buildDvrProfile('someProfileId')],
  ]);

  vi.mocked(useManageRecordingByEvent).mockReturnValue({
    pending: true,
    createRecording: async () => {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  const document = render(<EventView />);

  expect(document.asFragment()).toMatchSnapshot();
});

test('should render with related events', () => {
  vi.mocked(useLoaderData).mockReturnValue([
    buildEvent(),
    relatedEvents,
    [buildDvrProfile('someProfileId')],
  ]);

  vi.mocked(useManageRecordingByEvent).mockReturnValue({
    pending: false,
    createRecording: async () => {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  const document = render(<EventView />);

  expect(document.asFragment()).toMatchSnapshot();
});

test('should create recording', async () => {
  vi.mocked(useLoaderData).mockReturnValue([
    buildEvent(),
    [],
    [buildDvrProfile('someProfileId')],
  ]);

  const createRecordingMock = vi.fn();
  vi.mocked(useManageRecordingByEvent).mockReturnValue({
    pending: false,
    createRecording: createRecordingMock,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  const document = render(<EventView />);

  await userEvent.click(document.getByText('record'));
  expect(createRecordingMock).toHaveBeenNthCalledWith(1, EVENT_ID, undefined);
});

test('should open profile selection', async () => {
  vi.mocked(useLoaderData).mockReturnValue([
    buildEvent(),
    [],
    [buildDvrProfile('someProfileId'), buildDvrProfile('someProfileId')],
  ]);

  const createRecordingMock = vi.fn();
  vi.mocked(useManageRecordingByEvent).mockReturnValue({
    pending: false,
    createRecording: createRecordingMock,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  const document = render(<EventView />);

  await userEvent.click(document.getByText('record'));
  expect(document.asFragment()).toMatchSnapshot();
});

test('should navigate to recording', async () => {
  vi.mocked(useLoaderData).mockReturnValue([
    buildEvent(RECORDING_ID),
    [],
    [buildDvrProfile('someProfileId')],
  ]);

  vi.mocked(useManageRecordingByEvent).mockReturnValue({
    pending: false,
    createRecording: async () => {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  const document = render(<EventView />);
  await userEvent.click(document.getByText('modify_recording'));

  expect(navigateMock).toHaveBeenCalledWith(`/dvr/recordings/${RECORDING_ID}`);
});

const rule = {
  id: 'rule1',
  enabled: true,
  name: 'Some Title',
  title: '^Some Title$',
  plainTitle: 'Some Title',
  isPattern: false,
  fullText: false,
  channelId: 'someChannelId',
  channelName: 'Some Channel',
  duplicates: 'skip_repeats' as const,
  creator: '',
  comment: '',
};

test('record series asks how, with this channel only and skipping repeats by default', async () => {
  vi.mocked(useLoaderData).mockReturnValue([
    buildEvent(),
    [],
    [buildDvrProfile('p')],
    [],
  ]);
  vi.mocked(useManageRecordingByEvent).mockReturnValue({
    pending: false,
    createRecording: vi.fn(),
  } as any); // eslint-disable-line @typescript-eslint/no-explicit-any
  vi.mocked(createAutorec).mockResolvedValue(rule as never);

  const document = render(<EventView />);
  await userEvent.click(document.getByTestId('record-series-button'));

  expect(
    (document.getByTestId('series-channel-only') as HTMLInputElement).checked
  ).toBe(true);
  expect(
    (document.getByTestId('series-any-channel') as HTMLInputElement).checked
  ).toBe(false);
  expect(
    (document.getByTestId('series-skip-repeats') as HTMLInputElement).checked
  ).toBe(true);

  await userEvent.click(document.getByTestId('series-create-button'));
  expect(createAutorec).toHaveBeenCalledWith({
    eventId: EVENT_ID,
    anyChannel: false,
    recordRepeats: false,
    configId: undefined,
  });
  expect(revalidateMock).toHaveBeenCalled();
});

test('record series can be for any channel with repeats', async () => {
  vi.mocked(useLoaderData).mockReturnValue([
    buildEvent(),
    [],
    [buildDvrProfile('p')],
    [],
  ]);
  vi.mocked(useManageRecordingByEvent).mockReturnValue({
    pending: false,
    createRecording: vi.fn(),
  } as any); // eslint-disable-line @typescript-eslint/no-explicit-any
  vi.mocked(createAutorec).mockResolvedValue(rule as never);

  const document = render(<EventView />);
  await userEvent.click(document.getByTestId('record-series-button'));
  await userEvent.click(document.getByTestId('series-any-channel'));
  await userEvent.click(document.getByTestId('series-skip-repeats'));
  await userEvent.click(document.getByTestId('series-create-button'));

  expect(createAutorec).toHaveBeenCalledWith(
    expect.objectContaining({ anyChannel: true, recordRepeats: true })
  );
});

test('an existing series rule is reported instead of creating a duplicate', async () => {
  vi.mocked(useLoaderData).mockReturnValue([
    buildEvent(),
    [],
    [buildDvrProfile('p')],
    [],
  ]);
  vi.mocked(useManageRecordingByEvent).mockReturnValue({
    pending: false,
    createRecording: vi.fn(),
  } as any); // eslint-disable-line @typescript-eslint/no-explicit-any
  vi.mocked(createAutorec).mockRejectedValue({ response: { status: 409 } });

  const document = render(<EventView />);
  await userEvent.click(document.getByTestId('record-series-button'));
  await userEvent.click(document.getByTestId('series-create-button'));

  expect(await document.findByText('series_exists')).toBeTruthy();
});

test('a programme already covered shows the rule and no record series button', () => {
  vi.mocked(useLoaderData).mockReturnValue([
    buildEvent(),
    [],
    [buildDvrProfile('p')],
    [rule],
  ]);
  vi.mocked(useManageRecordingByEvent).mockReturnValue({
    pending: false,
    createRecording: vi.fn(),
  } as any); // eslint-disable-line @typescript-eslint/no-explicit-any

  const document = render(<EventView />);
  expect(document.getByTestId('series-covered')).toBeTruthy();
  expect(document.queryByTestId('record-series-button')).toBeNull();
});
