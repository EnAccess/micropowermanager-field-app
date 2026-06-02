import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import ar from './locales/ar.json';
import bu from './locales/bu.json';
import en from './locales/en.json';
import fr from './locales/fr.json';
import pt from './locales/pt.json';

export const SUPPORTED_LANGUAGES = ['ar', 'bu', 'en', 'fr', 'pt'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const FALLBACK_LANGUAGE: SupportedLanguage = 'en';

const STORAGE_KEY = 'mpm.user_language';

// Backend uses non-standard "bu" for Burmese; map the ISO 639-1 "my" the OS
// would report through to it so a Myanmar device picks up the right bundle.
const ALIASES: Record<string, SupportedLanguage> = { my: 'bu' };

export function normalizeLanguage(
  input: string | null | undefined,
): SupportedLanguage | null {
  if (!input) return null;
  const code = input.toLowerCase().split(/[-_]/)[0];
  if (code in ALIASES) return ALIASES[code];
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(code)
    ? (code as SupportedLanguage)
    : null;
}

export function deviceLanguage(): SupportedLanguage {
  const code = Localization.getLocales?.()[0]?.languageCode;
  return normalizeLanguage(code) ?? FALLBACK_LANGUAGE;
}

export async function readCachedLanguage(): Promise<SupportedLanguage | null> {
  try {
    return normalizeLanguage(await AsyncStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

export async function writeCachedLanguage(
  lang: SupportedLanguage,
): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, lang);
}

void i18n.use(initReactI18next).init({
  resources: {
    ar: { translation: ar },
    bu: { translation: bu },
    en: { translation: en },
    fr: { translation: fr },
    pt: { translation: pt },
  },
  lng: deviceLanguage(),
  fallbackLng: FALLBACK_LANGUAGE,
  interpolation: { escapeValue: false },
  returnNull: false,
  compatibilityJSON: 'v4',
});

export default i18n;
