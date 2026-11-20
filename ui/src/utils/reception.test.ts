import { expect, test } from 'vitest';

import { damagedErrors } from './reception';

test('only recordings with real reception trouble are flagged', () => {
  expect(damagedErrors(null)).toBeNull();
  expect(
    damagedErrors({ statusText: 'Completed OK', dataErrors: 335 })
  ).toBeNull();
  expect(damagedErrors({ statusText: 'Completed OK' })).toBeNull();
  expect(damagedErrors({ statusText: 'Completed OK', dataErrors: 5000 })).toBe(
    5000
  );
  expect(
    damagedErrors({ statusText: 'Too many data errors', dataErrors: 18152 })
  ).toBe(18152);
  expect(damagedErrors({ statusText: 'Too many data errors' })).toBe(0);
});
