import { useEffect, useState } from 'react';

import { Clash } from '@/clients/api/api.types';
import { getClashes } from '@/clients/api/api';

type Probe = { channelId: string; start: number; end: number; title: string };

// Clashes between scheduled recordings, optionally with one more programme added (null = not yet known / none).
export function useClashes(probe?: Probe | null, enabled = true): Clash[] {
  const [clashes, setClashes] = useState<Clash[]>([]);
  const key = probe
    ? `${probe.channelId}|${probe.start}|${probe.end}`
    : 'scheduled';

  useEffect(() => {
    if (!enabled) {
      return;
    }
    let live = true;
    getClashes(probe ?? undefined)
      .then((c) => live && setClashes(c))
      .catch(() => live && setClashes([]));
    return () => {
      live = false;
    };
  }, [key, enabled]);

  return clashes;
}
