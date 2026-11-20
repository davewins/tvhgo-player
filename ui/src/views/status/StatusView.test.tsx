import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

import { Recording } from '@/clients/api/api.types';
import { Component as StatusView } from './StatusView';
import { usePipeline } from '@/hooks/pipeline';
import { useTuners } from '@/hooks/tuners';
import { useUpcoming } from '@/hooks/activity';

vi.mock('@/hooks/pipeline');
vi.mock('@/hooks/tuners');
vi.mock('@/hooks/activity');

const nowS = Math.floor(Date.now() / 1000);
const rec = (id: string, title: string, status: string, start: number) =>
  ({
    id,
    title,
    status,
    channelName: 'ITV1 HD',
    startsAt: start,
    endsAt: start + 3600,
  }) as Recording;

beforeEach(() => {
  vi.mocked(useTuners).mockReturnValue(null);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test('shows what is recording, what is converting and what is next', () => {
  vi.mocked(useUpcoming).mockReturnValue([
    rec('1', 'Emmerdale', 'recording', nowS - 600),
    rec('2', 'Coronation Street', 'scheduled', nowS + 7200),
  ]);
  vi.mocked(usePipeline).mockReturnValue({
    available: true,
    current: {
      id: 'x',
      title: 'Four in a Bed',
      step: 'convert_mp4',
      percent: 40,
      since: nowS - 120,
    },
    queue: [
      { id: 'x', title: 'Four in a Bed', steps: [] },
      { id: 'y', title: 'Flog It!', steps: [] },
    ],
    failed: [],
  });
  const doc = render(<StatusView />);
  expect(doc.getAllByTestId('status-rec')).toHaveLength(1);
  expect(doc.getByTestId('status-rec').textContent).toContain('Emmerdale');
  expect(doc.getByTestId('status-converting').textContent).toContain(
    'Four in a Bed'
  );
  expect(doc.getByText('Flog It!')).toBeTruthy();
  expect(doc.getAllByTestId('status-next')).toHaveLength(1);
});

test('says so when there is nothing going on or no pipeline', () => {
  vi.mocked(useUpcoming).mockReturnValue([]);
  vi.mocked(usePipeline).mockReturnValue(null);
  const doc = render(<StatusView />);
  expect(doc.queryByTestId('status-rec')).toBeNull();
  expect(doc.queryByTestId('status-converting')).toBeNull();
  expect(doc.getByText('status_pipeline_unavailable')).toBeTruthy();
});
