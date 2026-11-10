import { useEffect, useState } from 'react';

import { PipelineStatus } from '@/clients/api/api.types';
import { getPipeline } from '@/clients/api/api';

const EVERY_MS = 5000;

// One shared poller however many components ask: the status of the background recording pipeline.
let current: PipelineStatus | null = null;
const listeners = new Set<(s: PipelineStatus | null) => void>();
let timer: ReturnType<typeof setInterval> | undefined;

async function poll() {
  if (document.hidden) {
    return;
  }
  try {
    const s = await getPipeline();
    current = s.available ? s : null;
  } catch {
    // keep what we last knew
  }
  listeners.forEach((l) => l(current));
}

export function usePipeline(): PipelineStatus | null {
  const [status, setStatus] = useState<PipelineStatus | null>(current);

  useEffect(() => {
    listeners.add(setStatus);
    if (listeners.size === 1) {
      poll();
      timer = setInterval(poll, EVERY_MS);
    } else {
      setStatus(current);
    }
    return () => {
      listeners.delete(setStatus);
      if (listeners.size === 0 && timer) {
        clearInterval(timer);
        timer = undefined;
      }
    };
  }, []);

  return status;
}
