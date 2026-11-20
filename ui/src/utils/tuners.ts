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

// "Safari on iPhone" from a browser's user agent string
export function browserName(ua: string): string {
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox|FxiOS/.test(ua)
      ? 'Firefox'
      : /Chrome|CriOS/.test(ua)
        ? 'Chrome'
        : /Safari/.test(ua)
          ? 'Safari'
          : '';
  const device = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Macintosh|Mac OS X/.test(ua)
            ? 'Mac'
            : /Linux/.test(ua)
              ? 'Linux'
              : '';
  if (browser && device) {
    return `${browser} on ${device}`;
  }
  return browser || device || ua.slice(0, 40);
}

// Who is behind a tuner user, for people: "Safari on iPhone" for a stream started in tvhgo, "Jellyfin" for Jellyfin,
// otherwise whatever Tvheadend knows (program name, account, address). Empty when nothing is known.
export function viewerLabel(u: {
  client?: string;
  username?: string;
  host?: string;
}): string {
  const client = u.client ?? '';
  if (client.startsWith('tvhgo: ')) {
    return browserName(client.slice('tvhgo: '.length));
  }
  if (u.username === 'jellyfin' || /^Lavf\//.test(client)) {
    return `Jellyfin${u.host ? ` (${u.host})` : ''}`;
  }
  return [client, u.username, u.host].filter(Boolean).join(' · ');
}
