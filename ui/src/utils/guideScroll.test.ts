import { describe, expect, test } from 'vitest';

import { openingScrollPx } from './guideScroll';

const at = (h: number, m = 0) => new Date(2026, 10, 10, h, m, 0);

describe('openingScrollPx', () => {
  const base = { pxPerMin: 5, leadMin: 10 };

  test('another day opens at the current time of day, not at a fixed hour', () => {
    // 15:40 now: 940 minutes into the day, minus a 10 minute lead, 5 px per minute
    expect(
      openingScrollPx({
        ...base,
        isToday: false,
        axisStart: 0,
        now: at(15, 40),
      })
    ).toBe((15 * 60 + 40 - 10) * 5);
    expect(
      openingScrollPx({ ...base, isToday: false, axisStart: 0, now: at(9, 0) })
    ).toBe((9 * 60 - 10) * 5);
  });

  test('just after midnight does not scroll backwards', () => {
    expect(
      openingScrollPx({ ...base, isToday: false, axisStart: 0, now: at(0, 4) })
    ).toBe(0);
  });

  test('today opens at now, measured from the timeline start', () => {
    const now = at(15, 40);
    const axisStart = now.getTime() / 1000 - 45 * 60; // timeline starts 45 minutes before now
    expect(openingScrollPx({ ...base, isToday: true, axisStart, now })).toBe(
      (45 - 10) * 5
    );
  });
});
