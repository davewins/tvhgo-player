import { describe, expect, test } from 'vitest';

import { Autorec } from '@/clients/api/api.types';
import { coveringRule } from './autorec';

const rule = (over: Partial<Autorec>): Autorec => ({
  id: 'r',
  enabled: true,
  name: 'n',
  title: '^Emmerdale$',
  plainTitle: 'Emmerdale',
  isPattern: false,
  fullText: false,
  channelId: 'itv1',
  channelName: 'ITV1 HD',
  duplicates: 'skip_repeats',
  creator: '',
  comment: '',
  ...over,
});

describe('coveringRule', () => {
  const event = { title: 'Emmerdale', channelId: 'itv1' };

  test('matches the title on the rule channel, ignoring case', () => {
    expect(
      coveringRule([rule({})], { ...event, title: 'EMMERDALE' })
    ).toBeTruthy();
  });
  test('a rule for another channel does not cover it', () => {
    expect(coveringRule([rule({ channelId: 'bbc1' })], event)).toBeUndefined();
  });
  test('a rule for any channel covers it', () => {
    expect(coveringRule([rule({ channelId: '' })], event)).toBeTruthy();
  });
  test('a different title or a disabled rule does not', () => {
    expect(
      coveringRule([rule({})], { ...event, title: 'Emmerdale Extra' })
    ).toBeUndefined();
    expect(coveringRule([rule({ enabled: false })], event)).toBeUndefined();
  });
  test('real patterns work, bad ones are ignored', () => {
    expect(
      coveringRule(
        [rule({ title: '^(F1|Formula 1)\\b.*Highlights', channelId: '' })],
        { ...event, title: 'Formula 1 Highlights' }
      )
    ).toBeTruthy();
    expect(
      coveringRule([rule({ title: '([unclosed' })], event)
    ).toBeUndefined();
  });
  test('full text rules are not guessed at', () => {
    expect(coveringRule([rule({ fullText: true })], event)).toBeUndefined();
  });
});
