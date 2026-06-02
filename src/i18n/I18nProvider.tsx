import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import { useSession } from '@/auth/SessionContext';

import i18n, {
  deviceLanguage,
  normalizeLanguage,
  readCachedLanguage,
  SUPPORTED_LANGUAGES,
  SupportedLanguage,
  writeCachedLanguage,
} from './index';

type I18nValue = {
  language: SupportedLanguage;
  supported: readonly SupportedLanguage[];
  setLanguage: (lang: SupportedLanguage) => Promise<void>;
};

const I18nContext = createContext<I18nValue | null>(null);

/**
 * Resolution order:
 *   1. Cached agent choice (AsyncStorage, survives logout)
 *   2. Server tenant default (`appSettings.language` from /app/me)
 *   3. Device locale
 *   4. Fallback 'en' (already wired in i18n init)
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const { appSettings } = useSession();
  const [language, setLanguageState] = useState<SupportedLanguage>(
    (i18n.language as SupportedLanguage) ?? deviceLanguage(),
  );
  const hasCachedChoiceRef = useRef<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const cached = await readCachedLanguage();
      if (cancelled) return;
      hasCachedChoiceRef.current = cached !== null;
      const next = cached ?? deviceLanguage();
      if (i18n.language !== next) {
        await i18n.changeLanguage(next);
      }
      setLanguageState(next);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (hasCachedChoiceRef.current !== false) return;
    const serverLang = normalizeLanguage(appSettings?.language);
    if (!serverLang || serverLang === i18n.language) return;
    void i18n
      .changeLanguage(serverLang)
      .then(() => setLanguageState(serverLang));
  }, [appSettings?.language]);

  const setLanguage = useCallback(async (lang: SupportedLanguage) => {
    await writeCachedLanguage(lang);
    hasCachedChoiceRef.current = true;
    await i18n.changeLanguage(lang);
    setLanguageState(lang);
  }, []);

  return (
    <I18nContext.Provider
      value={{ language, supported: SUPPORTED_LANGUAGES, setLanguage }}
    >
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used within an I18nProvider');
  return value;
}
