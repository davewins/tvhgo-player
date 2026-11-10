import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, render, within } from '@testing-library/react';
import { deleteAutorec, setAutorecEnabled } from '@/clients/api/api';
import { useLoaderData, useRevalidator } from 'react-router-dom';

import { Autorec } from '@/clients/api/api.types';
import { Component as SeriesRulesView } from './SeriesRulesView';
import userEvent from '@testing-library/user-event';

vi.mock('react-router-dom');
vi.mock('@/clients/api/api', async (orig) => ({
  ...(await orig<typeof import('@/clients/api/api')>()),
  setAutorecEnabled: vi.fn().mockResolvedValue(undefined),
  deleteAutorec: vi.fn().mockResolvedValue(undefined),
}));

const rule = (over: Partial<Autorec>): Autorec => ({
  id: 'r1',
  enabled: true,
  name: 'Emmerdale',
  title: '^Emmerdale$',
  plainTitle: 'Emmerdale',
  isPattern: false,
  fullText: false,
  channelId: 'itv1',
  channelName: 'ITV1 HD',
  duplicates: 'skip_repeats',
  creator: 'admin',
  comment: '',
  ...over,
});

const revalidate = vi.fn();

beforeEach(() => {
  vi.mocked(useRevalidator).mockReturnValue({ revalidate, state: 'idle' });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test('lists each rule with its channel', () => {
  vi.mocked(useLoaderData).mockReturnValue([
    rule({}),
    rule({ id: 'r2', plainTitle: 'News', channelId: '', channelName: '' }),
  ]);
  const doc = render(<SeriesRulesView />);
  const rules = doc.getAllByTestId('series-rule');
  expect(rules).toHaveLength(2);
  expect(within(rules[0]).getByText(/series_every/).textContent).toContain(
    'series_on_channel'
  );
  expect(within(rules[1]).getByText(/series_every/).textContent).toContain(
    'series_on_any_channel'
  );
});

test('shows an empty state when there are no rules', () => {
  vi.mocked(useLoaderData).mockReturnValue([]);
  const doc = render(<SeriesRulesView />);
  expect(doc.queryAllByTestId('series-rule')).toHaveLength(0);
  expect(doc.getByText('series_none')).toBeTruthy();
});

test('a rule can be disabled', async () => {
  vi.mocked(useLoaderData).mockReturnValue([rule({})]);
  const doc = render(<SeriesRulesView />);
  await userEvent.click(doc.getByText('series_disable'));
  expect(setAutorecEnabled).toHaveBeenCalledWith('r1', false);
});

test('a disabled rule can be enabled and is marked', async () => {
  vi.mocked(useLoaderData).mockReturnValue([rule({ enabled: false })]);
  const doc = render(<SeriesRulesView />);
  expect(doc.getByText('series_disabled')).toBeTruthy();
  await userEvent.click(doc.getByText('series_enable'));
  expect(setAutorecEnabled).toHaveBeenCalledWith('r1', true);
});

test('deleting asks first', async () => {
  vi.mocked(useLoaderData).mockReturnValue([rule({})]);
  const doc = render(<SeriesRulesView />);
  // the confirmation dialog is rendered before the list, so the page's own Delete button is the last one
  await userEvent.click(doc.getAllByText('delete').at(-1) as HTMLElement);
  expect(deleteAutorec).not.toHaveBeenCalled();
  await userEvent.click(doc.getAllByText('delete')[0]);
  expect(deleteAutorec).toHaveBeenCalledWith('r1');
});

test('a real pattern is shown as a pattern', () => {
  vi.mocked(useLoaderData).mockReturnValue([
    rule({ isPattern: true, title: '^(F1|Formula 1)' }),
  ]);
  const doc = render(<SeriesRulesView />);
  expect(doc.getByText(/series_pattern/)).toBeTruthy();
});
