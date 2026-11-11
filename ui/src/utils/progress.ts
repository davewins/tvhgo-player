import { WatchProgress } from '@/clients/api/api.types';

// less than this watched is not worth resuming, and this close to the end counts as watched
const MIN_RESUME_S = 15;
const END_MARGIN_S = 60;
// start a little before where the viewer stopped, to pick up the thread
const REWIND_S = 5;

export function isWatched(p: WatchProgress | undefined): boolean {
  return !!p && p.duration > 0 && p.position >= p.duration - END_MARGIN_S;
}

// where to start playing, or null to start at the beginning
export function resumePoint(p: WatchProgress | undefined): number | null {
  if (!p || p.duration <= 0 || isWatched(p) || p.position < MIN_RESUME_S) {
    return null;
  }
  return Math.max(0, p.position - REWIND_S);
}

export function fraction(p: WatchProgress | undefined): number {
  if (!p || p.duration <= 0) {
    return 0;
  }
  return Math.min(1, Math.max(0, p.position / p.duration));
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}
