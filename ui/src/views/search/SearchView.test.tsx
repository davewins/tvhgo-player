import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { useLoaderData, useNavigate, useSearchParams } from 'react-router-dom';

import { Component as SearchView } from './SearchView';
import userEvent from '@testing-library/user-event';

vi.mock('react-router-dom');

const navigateMock = vi.fn();

const event = (id: number, title: string) => ({
  id,
  title,
  subtitle: '',
  description: `About ${title}`,
  startsAt: 1000,
  endsAt: 2000,
  channelId: 'c1',
  channelName: 'BBC One',
  channelNumber: 1,
  piconId: 5,
  nextEventId: 0,
});

beforeEach(() => {
  vi.mocked(useNavigate).mockReturnValue(navigateMock);
  vi.mocked(useSearchParams).mockReturnValue([
    new URLSearchParams('q=hunt'),
    vi.fn(),
  ]);
  vi.mocked(useLoaderData).mockReturnValue({
    entries: [event(1, 'Bargain Hunt'), event(2, 'Treasure Hunt')],
    total: 2,
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test('each result shows its programme artwork', () => {
  const doc = render(<SearchView />);
  const srcs = [...doc.container.querySelectorAll('img')].map((i) =>
    i.getAttribute('src')
  );
  expect(srcs).toContain('/api/epg/events/1/thumb');
  expect(srcs).toContain('/api/epg/events/2/thumb');
});

test('a result opens its programme page', async () => {
  const doc = render(<SearchView />);
  await userEvent.click(doc.getByText('Treasure Hunt'));
  expect(navigateMock).toHaveBeenCalledWith('/guide/events/2');
});
