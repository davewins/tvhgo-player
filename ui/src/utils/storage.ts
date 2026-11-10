import { Recording } from '@/clients/api/api.types';

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

// 1536 -> "1.5 KB"; one decimal below 10, none above (1.5 GB, 23 GB, 412 MB)
export function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) {
    return '0 B';
  }
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  const digits = value < 10 && unit > 0 ? 1 : 0;
  return `${value.toFixed(digits)} ${UNITS[unit]}`;
}

// what a recording takes on disk: the recording itself plus its MP4 copy
export const recordingBytes = (r: Pick<Recording, 'size' | 'playableSize'>) =>
  (r.size || 0) + (r.playableSize || 0);

export const totalBytes = (rs: Pick<Recording, 'size' | 'playableSize'>[]) =>
  rs.reduce((sum, r) => sum + recordingBytes(r), 0);

// "about 3 weeks" style estimate of how long the remaining space lasts, from hours of recording left
export function hoursLabel(hours: number): string {
  if (!hours || hours < 1) {
    return '';
  }
  return `${Math.round(hours).toLocaleString('en-GB')}`;
}

// share of the allowance used, 0-100 (at least 1 when anything is used, so the bar is visible)
export function percentUsed(used: number, allowance: number): number {
  if (allowance <= 0 || used <= 0) {
    return 0;
  }
  return Math.min(100, Math.max(1, Math.round((used / allowance) * 100)));
}
