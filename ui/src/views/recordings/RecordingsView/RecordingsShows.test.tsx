import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, render, within } from '@testing-library/react';
import {
  useLoaderData,
  useLocation,
  useNavigate,
  useRevalidator,
  useSearchParams,
} from 'react-router-dom';

import { Recording } from '@/clients/api/api.types';
import { Component as RecordingsView } from './RecordingsView';
import { TestIds } from '@/__test__/ids';
import { useLoading } from '@/contexts/LoadingContext';
import { useManageRecordings } from '@/hooks/recording';
import userEvent from '@testing-library/user-event';

vi.mock('@/contexts/LoadingContext');
vi.mock('@/hooks/recording');
vi.mock('react-router-dom');
vi.mock('@/components/player/Player', () => ({
  default: ({ title, recordingId }: { title: string; recordingId: string }) => (
    <div data-testid="player-stub">{`${title}:${recordingId}`}</div>
  ),
}));

const navigateMock = vi.fn();
const setQueryParamsMock = vi.fn();

const rec = (id: string, title: string, startsAt: number, subtitle = '') =>
  ({
    id,
    title,
    subtitle,
    startsAt,
    endsAt: startsAt + 100,
    channelName: 'ITV',
    status: 'completed',
  }) as Recording;

const entries = [
  rec('1', 'Emmerdale', 100, 'Ep 1'),
  rec('2', 'Emmerdale', 300, 'Ep 2'),
  rec('3', 'Coronation Street', 200),
];

const withParams = (q: string) =>
  vi
    .mocked(useSearchParams)
    .mockReturnValue([new URLSearchParams(q), setQueryParamsMock]);

beforeEach(() => {
  localStorage.clear();
  vi.mocked(useLoading).mockReturnValue({
    isLoading: false,
    setIsLoading: vi.fn(),
  });
  vi.mocked(useManageRecordings).mockReturnValue({
    pending: false,
    removeRecordings: vi.fn(),
    stopAndCancelRecordings: vi.fn(),
  });
  vi.mocked(useNavigate).mockReturnValue(navigateMock);
  vi.mocked(useRevalidator).mockReturnValue({
    revalidate: vi.fn(),
    state: 'idle',
  });
  vi.mocked(useLocation).mockReturnValue({
    hash: '',
    key: '',
    pathname: '',
    search: '',
    state: null,
  });
  vi.mocked(useLoaderData).mockReturnValue({
    entries,
    offset: 0,
    total: entries.length,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test('finished recordings are grouped into one tile per show, newest show first', () => {
  withParams('');
  const doc = render(<RecordingsView />);
  const tiles = doc.getAllByTestId(TestIds.SHOW_TILE);
  expect(tiles.map((t) => t.getAttribute('aria-label'))).toEqual([
    'Emmerdale',
    'Coronation Street',
  ]);
  // the episode count is shown for a show with several episodes
  expect(within(tiles[0]).getByText('2')).toBeTruthy();
  expect(doc.queryByTestId(TestIds.SELECT_RECORDING_CHECKBOX)).toBeNull();
});

test('clicking a show opens it', async () => {
  withParams('');
  const doc = render(<RecordingsView />);
  await userEvent.click(doc.getAllByTestId(TestIds.SHOW_TILE)[0]);
  const params = new URLSearchParams();
  setQueryParamsMock.mock.calls[0][0](params);
  expect(params.get('show')).toBe('Emmerdale');
});

test('inside a show only its episodes are listed, newest first, and can be opened', async () => {
  withParams('show=Emmerdale');
  const doc = render(<RecordingsView />);
  expect(doc.queryAllByTestId(TestIds.SHOW_TILE)).toHaveLength(0);
  expect(doc.getAllByTestId(TestIds.SELECT_RECORDING_CHECKBOX)).toHaveLength(2);
  expect(doc.getByText('Ep 2')).toBeTruthy();
  expect(doc.queryByText('Coronation Street')).toBeNull();
  // the date line opens the recording's page
  await userEvent.click(doc.getAllByText(/short_date/)[0]);
  expect(navigateMock).toHaveBeenCalledWith('/dvr/recordings/2');
});

test('clicking a thumbnail plays the recording straight away', async () => {
  withParams('show=Emmerdale');
  const doc = render(<RecordingsView />);
  expect(doc.queryByTestId('player-stub')).toBeNull();
  await userEvent.click(doc.container.querySelectorAll('img')[0]);
  expect(doc.getByTestId('player-stub').textContent).toBe('Emmerdale:2');
  expect(navigateMock).not.toHaveBeenCalled();
});

test('selecting recordings offers Download as well as Delete', async () => {
  withParams('show=Emmerdale');
  const doc = render(<RecordingsView />);
  expect(doc.queryByTestId(TestIds.DOWNLOAD_RECORDINGS_BUTTON)).toBeNull();
  await userEvent.click(
    doc.getAllByTestId(TestIds.SELECT_RECORDING_CHECKBOX)[0]
  );
  expect(doc.getByTestId(TestIds.DOWNLOAD_RECORDINGS_BUTTON)).toBeTruthy();
  expect(doc.getByTestId(TestIds.DELETE_CANCEL_RECORDINGS_BUTTON)).toBeTruthy();
});

test('no Download for upcoming recordings', async () => {
  withParams('status=upcoming');
  vi.mocked(useLoaderData).mockReturnValue({
    entries: entries.map((e) => ({ ...e, status: 'scheduled' })),
    offset: 0,
    total: 3,
  });
  const doc = render(<RecordingsView />);
  await userEvent.click(
    doc.getAllByTestId(TestIds.SELECT_RECORDING_CHECKBOX)[0]
  );
  expect(doc.queryByTestId(TestIds.DOWNLOAD_RECORDINGS_BUTTON)).toBeNull();
});

test('back returns to the shows', async () => {
  withParams('show=Emmerdale');
  const doc = render(<RecordingsView />);
  await userEvent.click(doc.getByTestId(TestIds.RECORDINGS_BACK_TO_SHOWS));
  const params = new URLSearchParams('show=Emmerdale');
  setQueryParamsMock.mock.calls[0][0](params);
  expect(params.has('show')).toBe(false);
});

test('the layout choice is remembered', async () => {
  withParams('');
  const doc = render(<RecordingsView />);
  await userEvent.click(doc.getByTestId(TestIds.RECORDINGS_LAYOUT_LIST));
  expect(localStorage.getItem('tvhgo.recordingsLayout')).toBe('list');
  cleanup();
  const again = render(<RecordingsView />);
  // the remembered layout is the highlighted one, so the list button now looks different from the grid button
  expect(
    again
      .getByTestId(TestIds.RECORDINGS_LAYOUT_LIST)
      .getAttribute('aria-pressed')
  ).toBe('true');
  expect(again.getByTestId(TestIds.RECORDINGS_LAYOUT_LIST).className).not.toBe(
    again.getByTestId(TestIds.RECORDINGS_LAYOUT_GRID).className
  );
});

test('sorting shows by title', () => {
  withParams('sort=title');
  const doc = render(<RecordingsView />);
  expect(
    doc
      .getAllByTestId(TestIds.SHOW_TILE)
      .map((t) => t.getAttribute('aria-label'))
  ).toEqual(['Coronation Street', 'Emmerdale']);
});

test('the flat list is still available and the other statuses are not grouped', () => {
  withParams('view=list');
  const flat = render(<RecordingsView />);
  expect(flat.queryAllByTestId(TestIds.SHOW_TILE)).toHaveLength(0);
  expect(flat.getAllByTestId(TestIds.SELECT_RECORDING_CHECKBOX)).toHaveLength(
    3
  );
  cleanup();
  withParams('status=upcoming');
  const upcoming = render(<RecordingsView />);
  expect(upcoming.queryAllByTestId(TestIds.SHOW_TILE)).toHaveLength(0);
});
