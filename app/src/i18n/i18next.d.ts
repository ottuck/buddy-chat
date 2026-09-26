import 'i18next';

import type en from './locales/en.json';

// Type-checks translation keys against the English messages.
declare module 'i18next' {
  interface CustomTypeOptions {
    resources: { translation: typeof en };
  }
}
