import { TunerStatus } from '@/clients/api/api.types';

// "EastEnders and Film4" / "A, B and C" ... what is holding the tuners
export function busyList(status: TunerStatus): string[] {
  return status.tuners
    .flatMap((t) => t.users.map((u) => u.title))
    .filter(Boolean);
}

export function joinNames(names: string[]): string {
  const unique = Array.from(new Set(names));
  if (unique.length <= 1) {
    return unique.join('');
  }
  return `${unique.slice(0, -1).join(', ')} & ${unique[unique.length - 1]}`;
}

export const isFull = (s: TunerStatus | null): s is TunerStatus =>
  !!s && s.total > 0 && s.busy >= s.total;

// the multiplexes the busy tuners are on ("482MHz", "498MHz")
export function heldMuxes(status: TunerStatus): string {
  return status.tuners
    .filter((t) => t.busy && t.mux)
    .map((t) => t.mux.split(' in ')[0])
    .join(' and ');
}
