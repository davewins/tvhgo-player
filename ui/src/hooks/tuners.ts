import { useEffect, useState } from 'react';

import { TunerStatus } from '@/clients/api/api.types';
import { getTuners } from '@/clients/api/api';

const EVERY_MS = 10000;

// What each tuner is doing, refreshed while the page is visible. null until known (or when unavailable).
export function useTuners(): TunerStatus | null {
  const [status, setStatus] = useState<TunerStatus | null>(null);

  useEffect(() => {
    let live = true;
    const load = async () => {
      if (document.hidden) {
        return;
      }
      try {
        const s = await getTuners();
        if (live) {
          setStatus(s.available ? s : null);
        }
      } catch {
        // keep the last known state: a failed poll should not flash a warning away
      }
    };
    load();
    const id = setInterval(load, EVERY_MS);
    document.addEventListener('visibilitychange', load);
    return () => {
      live = false;
      clearInterval(id);
      document.removeEventListener('visibilitychange', load);
    };
  }, []);

  return status;
}
