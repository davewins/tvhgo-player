import { Chapter } from '@/clients/api/api.types';

// where a click/tap at clientX on a bar (its left edge and width) lands, in seconds
export function timeAt(
  clientX: number,
  left: number,
  width: number,
  duration: number
): number {
  if (width <= 0 || duration <= 0) {
    return 0;
  }
  const f = Math.min(1, Math.max(0, (clientX - left) / width));
  return f * duration;
}

// start of the next ad break after `time` (null if there is none)
export function nextBreak(breaks: Chapter[], time: number): number | null {
  const next = breaks.find((b) => b.start > time + 1);
  return next ? next.start : null;
}

// start of the ad break before `time`; a few seconds into a break it jumps back to that break's own start
export function previousBreak(breaks: Chapter[], time: number): number | null {
  const before = [...breaks].reverse().find((b) => b.start < time - 3);
  return before ? before.start : null;
}
