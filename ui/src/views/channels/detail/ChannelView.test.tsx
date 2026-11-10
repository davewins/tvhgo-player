import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { useLoaderData, useNavigate, useSearchParams } from 'react-router-dom';

import { Component as ChannelView } from './ChannelView';
import userEvent from '@testing-library/user-event';

vi.mock('react-router-dom');
vi.mock('@/components/player/Player', () => ({ default: () => null }));

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
  vi.mocked(useSearchParams).mockReturnValue([new URLSearchParams(), vi.fn()]);
  vi.mocked(useLoaderData).mockReturnValue([
    { id: 'c1', name: 'BBC One', number: 1, piconId: 5 },
    { entries: [event(1, 'Bargain Hunt'), event(2, 'Pointless')], total: 2 },
  ]);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test('each programme shows its artwork, falling back to the channel logo', () => {
  const doc = render(<ChannelView />);
  const srcs = [...doc.container.querySelectorAll('img')].map((i) =>
    i.getAttribute('src')
  );
  expect(srcs).toContain('/api/epg/events/1/thumb');
  expect(srcs).toContain('/api/epg/events/2/thumb');
});

test('has a back button', async () => {
  const doc = render(<ChannelView />);
  await userEvent.click(doc.getByTestId('channel-back-button'));
  expect(navigateMock).toHaveBeenCalledWith(-1);
});

test('a programme opens its page', async () => {
  const doc = render(<ChannelView />);
  await userEvent.click(doc.getByText('Pointless'));
  expect(navigateMock).toHaveBeenCalledWith('/guide/events/2');
});
