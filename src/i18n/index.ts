import { createI18n } from "vue-i18n";
import { messages, type SupportedLocale } from "./messages";

export const LOCALE_STORAGE_KEY = "warchi.locale";
const DEFAULT_LOCALE: SupportedLocale = "ru";

const isSupportedLocale = (value: string | null): value is SupportedLocale => {
  return value === "ru" || value === "en";
};

const initialLocaleRaw =
  typeof window !== "undefined" ? window.localStorage.getItem(LOCALE_STORAGE_KEY) : null;
const initialLocale = isSupportedLocale(initialLocaleRaw) ? initialLocaleRaw : DEFAULT_LOCALE;

const i18n = createI18n({
  legacy: false,
  locale: initialLocale,
  fallbackLocale: DEFAULT_LOCALE,
  messages
});

if (typeof document !== "undefined") {
  document.documentElement.lang = initialLocale;
}

export default i18n;
