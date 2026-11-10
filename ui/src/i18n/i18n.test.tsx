import { expect, test } from 'vitest';
import i18n, { t } from 'i18next';

test('can initialize i18n', async () => {
  // set prod to true, to reduce logs.
  import.meta.env.PROD = true;

  await import('./i18n');

  expect(i18n.isInitialized).toBeTruthy();
  expect(t('username')).toEqual('Username');
});

test('English dates are UK dates by default, with the 12-hour clock kept', async () => {
  const { default: moment } = await import('moment/min/moment-with-locales');
  const { momentLocaleFor } = await import('./i18n');
  // 17 November 2026, 5 pm
  const d = new Date(2026, 10, 17, 17, 0);

  moment.locale(momentLocaleFor('en', null));
  expect(moment(d).format('L')).toBe('17/11/2026');
  expect(moment(d).format('ll')).toBe('17 Nov 2026');
  expect(moment(d).format('LT')).toBe('5:00 PM');

  // an explicit choice in Settings still wins, e.g. the 24-hour UK clock or the US layout
  expect(momentLocaleFor('en', 'en-gb')).toBe('en-gb');
  moment.locale(momentLocaleFor('en', 'en'));
  expect(moment(d).format('L')).toBe('11/17/2026');

  // other languages follow themselves
  expect(momentLocaleFor('de', null)).toBe('de');
  moment.locale('en');
});
