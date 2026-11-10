import { Recording } from '@/clients/api/api.types';
import { cleanTitle } from './title';

export type Show = {
  // the title all its recordings share
  title: string;
  // newest first
  episodes: Recording[];
  // the most recent episode (its thumbnail represents the show)
  latest: Recording;
};

export type ShowSort = 'newest' | 'oldest' | 'title' | 'count';
export type EpisodeSort = 'newest' | 'oldest' | 'title';

// Shows are told apart by title only, whatever the channel: the conversion pipeline files recordings into one
// folder per title for Jellyfin, so this view mirrors that.
// (without the broadcaster's tag: "New: Lingo" and "Lingo" are one show).
const keyOf = (title: string) => cleanTitle(title).toLowerCase();

export function groupShows(recordings: Recording[]): Show[] {
  const map = new Map<string, Recording[]>();
  for (const rec of recordings) {
    const key = keyOf(rec.title);
    const list = map.get(key);
    if (list) {
      list.push(rec);
    } else {
      map.set(key, [rec]);
    }
  }
  return [...map.values()].map((list) => {
    const episodes = sortEpisodes(list, 'newest');
    return {
      title: cleanTitle(episodes[0].title),
      episodes,
      latest: episodes[0],
    };
  });
}

const byTitle = (a: string, b: string) =>
  a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });

export function sortEpisodes(
  recordings: Recording[],
  sort: EpisodeSort
): Recording[] {
  const list = [...recordings];
  switch (sort) {
    case 'oldest':
      return list.sort((a, b) => a.startsAt - b.startsAt);
    case 'title':
      return list.sort(
        (a, b) =>
          byTitle(a.subtitle || a.title, b.subtitle || b.title) ||
          b.startsAt - a.startsAt
      );
    default:
      return list.sort((a, b) => b.startsAt - a.startsAt);
  }
}

export function sortShows(shows: Show[], sort: ShowSort): Show[] {
  const list = [...shows];
  switch (sort) {
    case 'oldest':
      return list.sort((a, b) => a.latest.startsAt - b.latest.startsAt);
    case 'title':
      return list.sort((a, b) => byTitle(a.title, b.title));
    case 'count':
      return list.sort(
        (a, b) =>
          b.episodes.length - a.episodes.length ||
          b.latest.startsAt - a.latest.startsAt
      );
    default:
      return list.sort((a, b) => b.latest.startsAt - a.latest.startsAt);
  }
}

export function findShow(
  shows: Show[],
  title: string | null
): Show | undefined {
  return title === null
    ? undefined
    : shows.find((s) => keyOf(s.title) === keyOf(title));
}
