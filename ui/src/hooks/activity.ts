import { useEffect, useState } from 'react';

import { Recording } from '@/clients/api/api.types';
import { getRecordings } from '@/clients/api/api';

const EVERY_MS = 15000;

// One shared poller: the recordings that are recording now or scheduled, soonest first. null until known.
let current: Recording[] | null = null;
const listeners = new Set<(r: Recording[] | null) => void>();
let timer: ReturnType<typeof setInterval> | undefined;

async function poll() {
  if (document.hidden) {
    return;
  }
  try {
    const r = await getRecordings({
      status: 'upcoming',
      limit: 50,
      sort_key: 'startsAt',
      sort_dir: 'asc',
    });
    current = r.entries;
  } catch {
    // keep what we last knew
  }
  listeners.forEach((l) => l(current));
}

export function useUpcoming(): Recording[] | null {
  const [recs, setRecs] = useState<Recording[] | null>(current);

  useEffect(() => {
    listeners.add(setRecs);
    if (listeners.size === 1) {
      poll();
      timer = setInterval(poll, EVERY_MS);
    } else {
      setRecs(current);
    }
    return () => {
      listeners.delete(setRecs);
      if (listeners.size === 0 && timer) {
        clearInterval(timer);
        timer = undefined;
      }
    };
  }, []);

  return recs;
}

// Recordings in progress right now.
export function useRecordingNow(): Recording[] {
  return (useUpcoming() ?? []).filter((r) => r.status === 'recording');
}
