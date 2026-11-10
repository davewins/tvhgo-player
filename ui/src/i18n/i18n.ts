import LanguageDetector from 'i18next-browser-languagedetector';
import de from './locales/de/translations.json';
import en from './locales/en/translations.json';
import es from './locales/es/translations.json';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import moment from 'moment/min/moment-with-locales';

const fallbackLng = 'en';

// moment's plain "en" is the US layout (11/17/2026, Nov 17, 2026). English here means UK English by default:
// day first, Monday as the first day of the week, and the 12-hour clock that was already in use. Choosing
// "en-gb" under Settings > General > Time format still gives the 24-hour clock.
moment.defineLocale('en-gb-12h', {
  parentLocale: 'en-gb',
  longDateFormat: {
    L: 'DD/MM/YYYY',
    LL: 'D MMMM YYYY',
    LT: 'h:mm A',
    LTS: 'h:mm:ss A',
    LLL: 'D MMMM YYYY h:mm A',
    LLLL: 'dddd, D MMMM YYYY h:mm A',
    lll: 'D MMM YYYY h:mm A',
    llll: 'ddd, D MMM YYYY h:mm A',
  },
});
moment.locale('en'); // defineLocale switches the active locale: restore it until the language is known

export function momentLocaleFor(language: string, timeLocale: string | null) {
  if (timeLocale) {
    return timeLocale;
  }
  // "en-US" etc. would be a person's own choice, but the app's "en" is UK English
  return language === 'en' ? 'en-gb-12h' : language;
}

i18n.on('languageChanged', (lng) => {
  moment.locale(momentLocaleFor(lng, localStorage.getItem('time_locale')));
});

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng,
    debug: !import.meta.env.PROD,
    supportedLngs: ['de', 'en', 'es'],
    resources: {
      de: {
        translation: de,
      },
      en: {
        translation: en,
      },
      es: {
        translation: es,
      },
    },

    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
  });

i18n.services.formatter?.add('moment', (value, _lng, options) => {
  return moment(new Date(value * 1000)).format(options.format);
});

i18n.services.formatter?.add('event_duration', (value) => {
  return `${Math.floor((value.endsAt - value.startsAt) / 60)}`;
});

export default i18n;
