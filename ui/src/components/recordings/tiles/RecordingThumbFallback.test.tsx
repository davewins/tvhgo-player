import { EpisodeTile, ShowTile } from './Tiles';
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

import { Recording } from '@/clients/api/api.types';
import RecordingListItem from '../listItem/RecordingListItem';

afterEach(cleanup);

const rec = {
  id: 'r1',
  title: 'ITV Lunchtime News',
  subtitle: '',
  description: '',
  startsAt: 1000,
  endsAt: 2000,
  channelName: 'ITV1 HD',
  piconId: 7,
  status: 'scheduled',
} as Recording;

const failThumb = (doc: ReturnType<typeof render>) =>
  fireEvent.error(doc.container.querySelector('img') as HTMLImageElement);

test('list row: no picture shows the channel logo instead of an empty box', () => {
  const doc = render(
    <RecordingListItem
      recording={rec}
      onClick={vi.fn()}
      onSelection={vi.fn()}
      selected={false}
    />
  );
  expect(doc.container.querySelector('img')?.getAttribute('src')).toBe(
    '/api/recordings/r1/thumb'
  );
  failThumb(doc);
  expect(doc.container.querySelector('img')?.getAttribute('src')).toBe(
    '/api/picon/7'
  );
});

test('episode card: no picture shows the channel logo', () => {
  const doc = render(
    <EpisodeTile
      recording={rec}
      onOpen={vi.fn()}
      selected={false}
      onSelection={vi.fn()}
    />
  );
  failThumb(doc);
  expect(doc.container.querySelector('img')?.getAttribute('src')).toBe(
    '/api/picon/7'
  );
});

test('show card: no picture shows the channel logo', () => {
  const doc = render(
    <ShowTile
      show={{ title: 'ITV Lunchtime News', episodes: [rec], latest: rec }}
      layout="grid"
      onOpen={vi.fn()}
    />
  );
  failThumb(doc);
  expect(doc.container.querySelector('img')?.getAttribute('src')).toBe(
    '/api/picon/7'
  );
});

test('a recording with a picture shows it, not the logo', () => {
  const doc = render(
    <RecordingListItem
      recording={rec}
      onClick={vi.fn()}
      onSelection={vi.fn()}
      selected={false}
    />
  );
  expect(doc.container.querySelectorAll('img')).toHaveLength(1);
  expect(doc.container.querySelector('img')?.getAttribute('src')).toContain(
    '/thumb'
  );
});
