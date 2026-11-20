import { damagedErrors, flaggedStatus } from './reception';
import { expect, test } from 'vitest';

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

test('only a status Tvheadend flagged is shown as a problem', () => {
  expect(
    flaggedStatus({ status: 'completed', statusText: 'Completed OK' })
  ).toBe('');
  expect(flaggedStatus({ status: 'completed', statusText: 'Forced OK' })).toBe(
    ''
  );
  expect(
    flaggedStatus({ status: 'completed', statusText: 'Too many data errors' })
  ).toBe('Too many data errors');
  expect(
    flaggedStatus({ status: 'completedError', statusText: 'Time missed' })
  ).toBe('Time missed');
  expect(flaggedStatus({ status: 'scheduled', statusText: 'Scheduled' })).toBe(
    ''
  );
});
