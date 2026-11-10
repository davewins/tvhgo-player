import { describe, expect, test } from 'vitest';
import { findShow, groupShows, sortEpisodes, sortShows } from './shows';

import { Recording } from '@/clients/api/api.types';

const rec = (id: string, title: string, startsAt: number, subtitle = '') =>
  ({ id, title, startsAt, subtitle, channelName: 'C' }) as Recording;

const recs = [
  rec('1', 'Emmerdale', 100, 'Ep 1'),
  rec('2', 'Coronation Street', 300),
  rec('3', 'emmerdale ', 200, 'Ep 2'),
  rec('4', 'Emmerdale', 400, 'Ep 3'),
  rec('5', 'Antiques Road Trip', 50),
];

describe('groupShows', () => {
  const shows = groupShows(recs);

  test('groups by title ignoring case and spacing', () => {
    expect(shows).toHaveLength(3);
    expect(shows.find((s) => s.title === 'Emmerdale')?.episodes).toHaveLength(
      3
    );
  });

  test('episodes are newest first and the latest represents the show', () => {
    const e = findShow(shows, 'Emmerdale')!;
    expect(e.episodes.map((r) => r.id)).toEqual(['4', '3', '1']);
    expect(e.latest.id).toBe('4');
  });

  test('empty input gives no shows', () => {
    expect(groupShows([])).toEqual([]);
  });
});

describe('broadcast tags', () => {
  test('"New: Lingo" and "Lingo" are one show, named without the tag', () => {
    const shows = groupShows([
      rec('1', 'New: Lingo', 100),
      rec('2', 'Lingo', 200),
      rec('3', 'Final: Lingo', 300),
      rec('4', 'DIY SOS: The Big Build', 150),
    ]);
    expect(shows).toHaveLength(2);
    const lingo = findShow(shows, 'Lingo')!;
    expect(lingo.title).toBe('Lingo');
    expect(lingo.episodes.map((r) => r.id)).toEqual(['3', '2', '1']);
    // a real "Name: Subtitle" title is left alone
    expect(findShow(shows, 'DIY SOS: The Big Build')).toBeTruthy();
    // and the tagged name finds the show too
    expect(findShow(shows, 'New: Lingo')).toBe(lingo);
  });
});

describe('sortShows', () => {
  const shows = groupShows(recs);
  const titles = (s: ReturnType<typeof sortShows>) => s.map((x) => x.title);

  test('newest', () =>
    expect(titles(sortShows(shows, 'newest'))).toEqual([
      'Emmerdale',
      'Coronation Street',
      'Antiques Road Trip',
    ]));
  test('oldest', () =>
    expect(titles(sortShows(shows, 'oldest'))).toEqual([
      'Antiques Road Trip',
      'Coronation Street',
      'Emmerdale',
    ]));
  test('title', () =>
    expect(titles(sortShows(shows, 'title'))).toEqual([
      'Antiques Road Trip',
      'Coronation Street',
      'Emmerdale',
    ]));
  test('count', () =>
    expect(titles(sortShows(shows, 'count'))[0]).toBe('Emmerdale'));
});

describe('sortEpisodes', () => {
  const eps = recs.filter((r) => r.title.toLowerCase().startsWith('emmerdale'));
  const ids = (l: Recording[]) => l.map((r) => r.id);
  test('newest', () =>
    expect(ids(sortEpisodes(eps, 'newest'))).toEqual(['4', '3', '1']));
  test('oldest', () =>
    expect(ids(sortEpisodes(eps, 'oldest'))).toEqual(['1', '3', '4']));
  test('title uses the episode name', () =>
    expect(ids(sortEpisodes(eps, 'title'))).toEqual(['1', '3', '4']));
  test('does not mutate its input', () => {
    const copy = [...eps];
    sortEpisodes(eps, 'oldest');
    expect(eps).toEqual(copy);
  });
});

describe('findShow', () => {
  test('matches case-insensitively, undefined when absent', () => {
    const shows = groupShows(recs);
    expect(findShow(shows, 'CORONATION street')?.title).toBe(
      'Coronation Street'
    );
    expect(findShow(shows, 'Nope')).toBeUndefined();
    expect(findShow(shows, null)).toBeUndefined();
  });
});
