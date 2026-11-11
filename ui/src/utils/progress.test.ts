import { describe, expect, it } from 'vitest';
import { formatClock, fraction, isWatched, resumePoint } from './progress';

const p = (position: number, duration = 3600) => ({
  recordingId: 'a',
  position,
  duration,
  updatedAt: 0,
});

describe('progress', () => {
  it('resumes a little before where the viewer stopped', () => {
    expect(resumePoint(p(1000))).toBe(995);
  });
  it('does not resume at the very start, near the end or without progress', () => {
    expect(resumePoint(p(10))).toBeNull();
    expect(resumePoint(p(3560))).toBeNull();
    expect(resumePoint(undefined)).toBeNull();
    expect(resumePoint(p(100, 0))).toBeNull();
  });
  it('counts the last minute as watched', () => {
    expect(isWatched(p(3540))).toBe(true);
    expect(isWatched(p(3000))).toBe(false);
  });
  it('gives a fraction between 0 and 1', () => {
    expect(fraction(p(1800))).toBe(0.5);
    expect(fraction(p(9999))).toBe(1);
    expect(fraction(undefined)).toBe(0);
  });
  it('formats clock times', () => {
    expect(formatClock(75)).toBe('1:15');
    expect(formatClock(3725)).toBe('1:02:05');
  });
});
