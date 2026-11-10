import { Autorec, EpgEvent } from '@/clients/api/api.types';

// The enabled series rule (if any) that would record this programme: its title pattern matches (tvheadend patterns
// are case-insensitive) and it is for this channel or for any channel.
export function coveringRule(
  rules: Autorec[],
  event: Pick<EpgEvent, 'title' | 'channelId'>
): Autorec | undefined {
  return rules.find((rule) => {
    if (!rule.enabled || rule.fullText) {
      return false;
    }
    if (rule.channelId && rule.channelId !== event.channelId) {
      return false;
    }
    try {
      return new RegExp(rule.title, 'i').test(event.title);
    } catch {
      // a pattern the browser's regular expressions do not understand: not shown as covering
      return false;
    }
  });
}
