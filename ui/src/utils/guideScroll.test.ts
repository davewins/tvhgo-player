import { describe, expect, test } from 'vitest';
import {
  openingScrollPx,
  scrollForMinutes,
  viewedMinutes,
} from './guideScroll';

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

describe('carrying the viewed time to another day', () => {
  const pxPerMin = 5;
  const todayMidnight = new Date(2026, 10, 10, 0, 0).getTime() / 1000;
  const tomorrowMidnight = todayMidnight + 86400;

  test('7pm viewed on today (whose timeline starts at 15:30) is 7pm on tomorrow (whose starts at midnight)', () => {
    const axisStart = todayMidnight + (15 * 60 + 30) * 60;
    // scrolled so 19:00 is at the left edge: 3.5 h = 210 min from the timeline start
    const minutes = viewedMinutes({
      scrollLeft: 210 * pxPerMin,
      axisStart,
      dayStart: todayMidnight,
      pxPerMin,
    });
    expect(minutes).toBe(19 * 60);
    expect(
      scrollForMinutes({
        minutes,
        dayStart: tomorrowMidnight,
        axisStart: tomorrowMidnight,
        pxPerMin,
      })
    ).toBe(19 * 60 * pxPerMin);
  });

  test('and back again: 7pm on tomorrow is 7pm on today, not "now"', () => {
    const axisStart = todayMidnight + (15 * 60 + 30) * 60;
    const back = scrollForMinutes({
      minutes: 19 * 60,
      dayStart: todayMidnight,
      axisStart,
      pxPerMin,
    });
    expect(back).toBe(210 * pxPerMin);
  });

  test("a time before the start of today's timeline stops at the start rather than going negative", () => {
    const axisStart = todayMidnight + (15 * 60 + 30) * 60;
    expect(
      scrollForMinutes({
        minutes: 9 * 60,
        dayStart: todayMidnight,
        axisStart,
        pxPerMin,
      })
    ).toBe(0);
  });

  test('a timeline that starts before midnight counts as the start of the day', () => {
    const axisStart = todayMidnight - 30 * 60; // 23:30 the evening before
    expect(
      viewedMinutes({
        scrollLeft: 0,
        axisStart,
        dayStart: todayMidnight,
        pxPerMin,
      })
    ).toBe(0);
  });
});
