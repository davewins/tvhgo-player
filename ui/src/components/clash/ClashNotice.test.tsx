import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';

import ClashNotice from './ClashNotice';

const clash = {
  start: 1794342000,
  end: 1794345600,
  entries: [
    {
      id: 'a',
      title: 'EastEnders',
      channelId: '1',
      channel: 'BBC ONE HD',
      start: 1,
      end: 2,
      mux: '482MHz',
    },
    {
      id: 'b',
      title: 'Film',
      channelId: '2',
      channel: 'Film4',
      start: 1,
      end: 2,
      mux: '506MHz',
    },
    {
      id: 'new',
      title: 'Quiz',
      channelId: '3',
      channel: 'ITV1',
      start: 1,
      end: 2,
      mux: '538MHz',
    },
  ],
};

describe('ClashNotice', () => {
  test('renders nothing without clashes', () => {
    const { container } = render(<ClashNotice clashes={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
  test('names every recording involved and its multiplex', () => {
    render(<ClashNotice clashes={[clash]} />);
    expect(screen.getByTestId('clash-notice')).toBeInTheDocument();
    expect(screen.getByText(/EastEnders/)).toBeInTheDocument();
    expect(screen.getByText(/\(538MHz\)/)).toBeInTheDocument();
  });
});
