import { describe, expect, it } from 'vitest';
import { nextBreak, previousBreak, timeAt } from './breaks';

const b = (start: number, end: number) => ({
  start,
  end,
  title: 'Commercial',
  advert: true,
});
const breaks = [b(0, 36), b(663, 917), b(1500, 1700)];

describe('breaks', () => {
  it('maps a position on the bar to a time, clamped to the bar', () => {
    expect(timeAt(150, 100, 200, 1000)).toBe(250);
    expect(timeAt(50, 100, 200, 1000)).toBe(0);
    expect(timeAt(999, 100, 200, 1000)).toBe(1000);
    expect(timeAt(150, 100, 0, 1000)).toBe(0);
    expect(timeAt(150, 100, 200, 0)).toBe(0);
  });
  it('finds the next break', () => {
    expect(nextBreak(breaks, 10)).toBe(663);
    expect(nextBreak(breaks, 700)).toBe(1500);
    expect(nextBreak(breaks, 1600)).toBeNull();
  });
  it('finds the previous break, jumping to the start of the break you are in', () => {
    expect(previousBreak(breaks, 1000)).toBe(663);
    expect(previousBreak(breaks, 665)).toBe(0); // 2 s into a break: the one before
    expect(previousBreak(breaks, 700)).toBe(663); // well into it: back to its start
    expect(previousBreak(breaks, 2)).toBeNull();
  });
});
