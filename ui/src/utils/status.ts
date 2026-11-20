// Helpers for the Status page: what is recording, what is converting, and how long it will take.

// "1 h 05 min", "12 min", "under a minute"
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) {
    return '<1 min';
  }
  const m = Math.round(s / 60);
  if (m < 60) {
    return `${m} min`;
  }
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}

// Seconds left for a conversion that is `percent` done and started `since` (epoch seconds), judged by how long it has
// taken so far. null while there is too little progress to say.
export function convertEta(
  percent: number | null,
  since: number,
  now: number
): number | null {
  if (percent === null || percent < 3 || percent >= 100) {
    return null;
  }
  const elapsed = now - since;
  if (elapsed <= 0) {
    return null;
  }
  return (elapsed * (100 - percent)) / percent;
}

// How far through a recording is (0..1), clamped.
export function recordingFraction(
  startsAt: number,
  endsAt: number,
  now: number
): number {
  if (endsAt <= startsAt) {
    return 0;
  }
  return Math.min(1, Math.max(0, (now - startsAt) / (endsAt - startsAt)));
}
