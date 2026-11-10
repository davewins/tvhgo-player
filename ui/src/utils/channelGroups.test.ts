import { availableGroups, inGroup, parseGroup } from './channelGroups';
import { describe, expect, test } from 'vitest';

const ch = (channelNumber: number, channelName: string) => ({
  channelNumber,
  channelName,
});

describe('inGroup', () => {
  test('HD by number or name', () => {
    expect(inGroup(ch(101, 'BBC ONE HD'), 'hd')).toBe(true);
    expect(inGroup(ch(300, 'Some HD'), 'hd')).toBe(true);
    expect(inGroup(ch(1, 'BBC ONE W Mid'), 'hd')).toBe(false);
  });
  test('+1 channels', () => {
    expect(inGroup(ch(15, 'Channel 4+1'), 'plus1')).toBe(true);
    expect(inGroup(ch(38, '5 +1'), 'plus1')).toBe(true);
    expect(inGroup(ch(35, 'ITV1+1'), 'plus1')).toBe(true);
    expect(inGroup(ch(4, 'Channel 4'), 'plus1')).toBe(false);
  });
  test('news', () => {
    expect(inGroup(ch(231, 'BBC NEWS'), 'news')).toBe(true);
    expect(inGroup(ch(233, 'Sky News'), 'news')).toBe(true);
    expect(inGroup(ch(236, 'GB News'), 'news')).toBe(true);
    expect(inGroup(ch(3, 'ITV1'), 'news')).toBe(false);
  });
  test('kids and shopping', () => {
    expect(inGroup(ch(120, 'CBBC HD'), 'kids')).toBe(true);
    expect(inGroup(ch(202, 'CBeebies'), 'kids')).toBe(true);
    expect(inGroup(ch(16, 'QVC'), 'shopping')).toBe(true);
    expect(inGroup(ch(51, 'Ideal World'), 'shopping')).toBe(true);
    expect(inGroup(ch(5, '5'), 'shopping')).toBe(false);
  });
  test('radio starts at 700; the red button and adult channels are not radio', () => {
    expect(inGroup(ch(700, 'BBC Radio 1'), 'radio')).toBe(true);
    expect(inGroup(ch(732, 'LBC'), 'radio')).toBe(true);
    expect(inGroup(ch(601, 'BBC RB 1'), 'radio')).toBe(false);
    expect(inGroup(ch(671, 'ADULT Xpanded TV'), 'radio')).toBe(false);
  });
  test('all matches everything', () => {
    expect(inGroup(ch(9, 'x'), 'all')).toBe(true);
  });
});

describe('parseGroup / availableGroups', () => {
  test('unknown values fall back to all', () => {
    expect(parseGroup(null)).toBe('all');
    expect(parseGroup('bogus')).toBe('all');
    expect(parseGroup('radio')).toBe('radio');
  });
  test('only groups with channels are offered', () => {
    expect(availableGroups([ch(1, 'BBC ONE'), ch(101, 'BBC ONE HD')])).toEqual([
      'all',
      'hd',
    ]);
  });
});
