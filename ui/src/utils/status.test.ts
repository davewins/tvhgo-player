import { convertEta, formatDuration, recordingFraction } from './status';
import { expect, test } from 'vitest';

test('durations read naturally', () => {
  expect(formatDuration(20)).toBe('<1 min');
  expect(formatDuration(12 * 60)).toBe('12 min');
  expect(formatDuration(65 * 60)).toBe('1 h 05 min');
});

test('the conversion estimate comes from the pace so far', () => {
  // 25% done after 100 s: 300 s left
  expect(convertEta(25, 1000, 1100)).toBe(300);
  expect(convertEta(1, 1000, 1100)).toBeNull();
  expect(convertEta(null, 1000, 1100)).toBeNull();
  expect(convertEta(100, 1000, 1100)).toBeNull();
});

test('recording progress is clamped', () => {
  expect(recordingFraction(100, 200, 150)).toBe(0.5);
  expect(recordingFraction(100, 200, 50)).toBe(0);
  expect(recordingFraction(100, 200, 999)).toBe(1);
});
