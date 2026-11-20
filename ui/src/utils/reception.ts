import { Recording } from '@/clients/api/api.types';

// A few hundred damaged packets in a programme is normal and invisible; thousands show as glitches.
export const NOTICEABLE_ERRORS = 1000;

// How many damaged packets Tvheadend saw, if the recording is likely to show glitches (Tvheadend flagged it as
// "Too many data errors", or the count is high); otherwise null.
export function damagedErrors(
  r: Pick<Recording, 'statusText' | 'dataErrors'> | null | undefined
): number | null {
  if (!r) {
    return null;
  }
  const flagged = /data errors/i.test(r.statusText ?? '');
  const count = r.dataErrors ?? 0;
  return flagged || count >= NOTICEABLE_ERRORS ? count : null;
}

const OK = /^(completed|forced) ok$/i;

// Tvheadend's own wording when it flagged a finished recording ("Too many data errors", "Time missed"), else ''.
export function flaggedStatus(
  r: Pick<Recording, 'status' | 'statusText'> | null | undefined
): string {
  if (!r || (r.status !== 'completed' && r.status !== 'completedError')) {
    return '';
  }
  return r.statusText && !OK.test(r.statusText) ? r.statusText : '';
}
