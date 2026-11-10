import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

import GuideEvent from './GuideEvent';

afterEach(cleanup);

const props = {
  eventId: 42,
  title: 'Bargain Hunt',
  subtitle: 'Antiques',
  description: '',
  startsAt: 1000,
  endsAt: 4000,
  onClick: vi.fn(),
};

test('no artwork unless asked for', () => {
  const doc = render(<GuideEvent {...props} />);
  expect(doc.container.querySelector('img')).toBeNull();
});

test('shows the programme artwork when asked', () => {
  const doc = render(<GuideEvent {...props} showThumb />);
  const img = doc.container.querySelector('img');
  expect(img?.getAttribute('src')).toBe('/api/epg/events/42/thumb');
  expect(img?.getAttribute('loading')).toBe('lazy');
});

test('falls back to the channel logo when there is no artwork', () => {
  const doc = render(
    <GuideEvent {...props} showThumb fallbackImage="/api/picon/3" />
  );
  fireEvent.error(doc.container.querySelector('img') as HTMLImageElement);
  const img = doc.container.querySelector('img');
  expect(img?.getAttribute('src')).toBe('/api/picon/3');
});

test('with no artwork and no logo there is just an empty tile', () => {
  const doc = render(<GuideEvent {...props} showThumb />);
  fireEvent.error(doc.container.querySelector('img') as HTMLImageElement);
  expect(doc.container.querySelector('img')).toBeNull();
  expect(doc.getByText('Bargain Hunt')).toBeTruthy();
});

test('clicking still opens the programme', () => {
  const onClick = vi.fn();
  const doc = render(<GuideEvent {...props} onClick={onClick} showThumb />);
  fireEvent.click(doc.getByText('Bargain Hunt'));
  expect(onClick).toHaveBeenCalledWith(42);
});
