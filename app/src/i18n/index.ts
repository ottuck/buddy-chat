import { getLocales } from 'expo-localization';
import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import { josa, type JosaPair } from './josa';
import en from './locales/en.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';

export const resources = {
  ja: { translation: ja satisfies typeof en }, // same keys as English
  ko: { translation: ko satisfies typeof en },
  en: { translation: en },
} as const;

export type Language = keyof typeof resources;

const FALLBACK_LANGUAGE: Language = 'en';

function isLanguage(code: string | null): code is Language {
  return code !== null && code in resources;
}

// First supported language in the user's device order, otherwise English.
function detectLanguage(): Language {
  for (const { languageCode } of getLocales()) {
    if (isLanguage(languageCode)) return languageCode;
  }
  return FALLBACK_LANGUAGE;
}

const i18n = createInstance();

i18n.use(initReactI18next).init({
  resources,
  lng: detectLanguage(),
  fallbackLng: FALLBACK_LANGUAGE,
  interpolation: { escapeValue: false }, // React already escapes.
});

// Korean particles after names, e.g. "{{buddy, 이가}} 배고파졌어요" → "하늘이 배고파졌어요".
for (const pair of ['이가', '은는', '과와'] satisfies JosaPair[]) {
  i18n.services.formatter?.add(pair, (value) => josa(String(value), pair));
}

export default i18n;
