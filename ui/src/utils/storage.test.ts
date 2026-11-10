import { describe, expect, test } from 'vitest';
import { formatBytes, hoursLabel, percentUsed, totalBytes } from './storage';

const nb = (s: string) => s.replace(' ', '\u00a0');

describe('formatBytes', () => {
  test('picks a sensible unit', () => {
    expect(formatBytes(0)).toBe(nb('0 B'));
    expect(formatBytes(512)).toBe(nb('512 B'));
    expect(formatBytes(1536)).toBe(nb('1.5 KB'));
    expect(formatBytes(959391448)).toBe(nb('915 MB'));
    expect(formatBytes(1.5 * 1024 ** 3)).toBe(nb('1.5 GB'));
    expect(formatBytes(23 * 1024 ** 3)).toBe(nb('23 GB'));
    expect(formatBytes(1024 ** 4)).toBe(nb('1.0 TB'));
  });
});

describe('totals', () => {
  test('a recording counts its file and its MP4 copy', () => {
    expect(
      totalBytes([
        { size: 100, playableSize: 50 },
        { size: 10, playableSize: 0 },
      ])
    ).toBe(160);
  });
});

describe('percentUsed / hoursLabel', () => {
  test('bar is at least 1% when anything is used, never over 100', () => {
    expect(percentUsed(0, 100)).toBe(0);
    expect(percentUsed(1, 1000)).toBe(1);
    expect(percentUsed(50, 100)).toBe(50);
    expect(percentUsed(200, 100)).toBe(100);
    expect(percentUsed(5, 0)).toBe(0);
  });
  test('hours', () => {
    expect(hoursLabel(0.5)).toBe('');
    expect(hoursLabel(417.4)).toBe('417');
  });
});
