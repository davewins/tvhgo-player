// Quick groupings for the channel guide, worked out from the channel number and name (UK Freeview numbering),
// so they need nothing set up in Tvheadend.
export type ChannelGroup =
  'all' | 'hd' | 'plus1' | 'news' | 'kids' | 'shopping' | 'radio';

export const CHANNEL_GROUPS: ChannelGroup[] = [
  'all',
  'hd',
  'plus1',
  'news',
  'kids',
  'shopping',
  'radio',
];

type Chan = { channelName: string; channelNumber: number | string };

const num = (c: Chan) => Number(c.channelNumber) || 0;

const RULES: Record<Exclude<ChannelGroup, 'all'>, (c: Chan) => boolean> = {
  hd: (c) => (num(c) >= 101 && num(c) <= 199) || /\bHD$/i.test(c.channelName),
  plus1: (c) => /\+\s?1$/.test(c.channelName.trim()),
  news: (c) =>
    (num(c) >= 231 && num(c) <= 236) || /\bnews\b/i.test(c.channelName),
  kids: (c) =>
    /^(CBBC|CBeebies|Cartoon|Nick|Pop\b|Tiny Pop)/i.test(c.channelName),
  shopping: (c) =>
    /^(QVC|TJC|Ideal World|Gemporia|Shop On TV|Shop )/i.test(c.channelName),
  // radio services are numbered from 700 on Freeview
  radio: (c) => num(c) >= 700,
};

export const inGroup = (c: Chan, group: ChannelGroup): boolean =>
  group === 'all' || RULES[group](c);

export const parseGroup = (value: string | null): ChannelGroup =>
  CHANNEL_GROUPS.find((g) => g === value) ?? 'all';

// the groups worth showing: "all" plus any group that has at least one channel
export const availableGroups = (channels: Chan[]): ChannelGroup[] =>
  CHANNEL_GROUPS.filter(
    (g) => g === 'all' || channels.some((c) => inGroup(c, g))
  );
