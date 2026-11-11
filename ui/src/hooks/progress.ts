import { useEffect, useState } from 'react';

import { WatchProgress } from '@/clients/api/api.types';
import { getWatchProgress } from '@/clients/api/api';

// How far the current user has watched each recording: one shared copy, so a tile updates as soon as the player saves.
type ProgressMap = Map<string, WatchProgress>;

let current: ProgressMap = new Map();
const listeners = new Set<(m: ProgressMap) => void>();

function publish(next: ProgressMap) {
  current = next;
  listeners.forEach((l) => l(current));
}

async function load() {
  try {
    const list = await getWatchProgress();
    publish(new Map(list.map((p) => [p.recordingId, p])));
  } catch {
    // keep what we have: progress is an extra
  }
}

export function setProgress(p: WatchProgress) {
  publish(new Map(current).set(p.recordingId, p));
}

export function dropProgress(recordingId: string) {
  const next = new Map(current);
  next.delete(recordingId);
  publish(next);
}

export function useWatchProgress(): ProgressMap {
  const [map, setMap] = useState<ProgressMap>(current);

  useEffect(() => {
    listeners.add(setMap);
    if (listeners.size === 1) {
      load();
    } else {
      setMap(current);
    }
    return () => {
      listeners.delete(setMap);
    };
  }, []);

  return map;
}
