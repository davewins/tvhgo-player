import { PipelineStatus } from '@/clients/api/api.types';

export type RecordingWork =
  | { kind: 'converting'; step: string; percent: number | null }
  | { kind: 'queued' }
  | { kind: 'failed'; giveUp: boolean }
  | null;

// What the background pipeline is doing with one recording.
export function workFor(
  status: PipelineStatus | null,
  id: string
): RecordingWork {
  if (!status) {
    return null;
  }
  if (status.current?.id === id) {
    return {
      kind: 'converting',
      step: status.current.step,
      percent: status.current.percent,
    };
  }
  const failed = status.failed.find((f) => f.id === id);
  if (failed) {
    return { kind: 'failed', giveUp: failed.retry_at === null };
  }
  if (status.queue.some((q) => q.id === id)) {
    return { kind: 'queued' };
  }
  return null;
}

// a failure only matters while its recording still has no playable MP4; "waiting" is everything not yet done
export function summary(status: PipelineStatus | null) {
  if (!status) {
    return null;
  }
  const waiting = status.queue.filter((q) => q.id !== status.current?.id);
  return {
    current: status.current,
    waiting: waiting.length,
    failed: status.failed.length,
    idle: !status.current && waiting.length === 0 && status.failed.length === 0,
  };
}
