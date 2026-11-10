import moment from 'moment';

// How far (in pixels) the Channels timeline is scrolled when it opens.
//
// Today opens at "now"; any other day opens at the same time of day as it is now (so at 15:40 tomorrow opens at about
// 15:30), not at a fixed evening hour. Either way a little of the past stays in view to the left of the point.
export function openingScrollPx(opts: {
  isToday: boolean;
  // unix seconds of the left edge of the timeline (midnight for another day, shortly before now for today)
  axisStart: number;
  now: Date;
  pxPerMin: number;
  leadMin: number;
}): number {
  const { isToday, axisStart, now, pxPerMin, leadMin } = opts;
  const minutes = isToday
    ? (now.getTime() / 1000 - axisStart) / 60
    : moment(now).diff(moment(now).startOf('day'), 'minutes', true);
  return Math.max(0, (minutes - leadMin) * pxPerMin);
}

// The time of day at the left edge of the visible timeline, as minutes since local midnight. A timeline that starts
// before the day it belongs to (today's starts a little before now, which can be just before midnight) counts as 0.
export function viewedMinutes(opts: {
  scrollLeft: number;
  axisStart: number;
  dayStart: number;
  pxPerMin: number;
}): number {
  const { scrollLeft, axisStart, dayStart, pxPerMin } = opts;
  const t = axisStart + (scrollLeft / pxPerMin) * 60;
  return Math.max(0, (t - dayStart) / 60);
}

// The scroll position that puts a time of day (minutes since local midnight) at the left edge on the given day.
export function scrollForMinutes(opts: {
  minutes: number;
  dayStart: number;
  axisStart: number;
  pxPerMin: number;
}): number {
  const { minutes, dayStart, axisStart, pxPerMin } = opts;
  return Math.max(0, ((dayStart + minutes * 60 - axisStart) / 60) * pxPerMin);
}
