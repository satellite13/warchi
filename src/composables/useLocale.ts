import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { LOCALE_STORAGE_KEY } from "../i18n";
import type { SupportedLocale } from "../i18n/messages";

const SUPPORTED_LOCALES: SupportedLocale[] = ["ru", "en"];

const isSupportedLocale = (value: string): value is SupportedLocale => {
  return SUPPORTED_LOCALES.includes(value as SupportedLocale);
};

export const useLocale = () => {
  const { locale } = useI18n({ useScope: "global" });

  const currentLocale = computed<SupportedLocale>({
    get() {
      return isSupportedLocale(locale.value) ? locale.value : "ru";
    },
    set(newLocale) {
      locale.value = newLocale;
      window.localStorage.setItem(LOCALE_STORAGE_KEY, newLocale);
      document.documentElement.lang = newLocale;
    }
  });

  const setLocale = (newLocale: SupportedLocale) => {
    currentLocale.value = newLocale;
  };

  const toggleLocale = () => {
    setLocale(currentLocale.value === "ru" ? "en" : "ru");
  };

  return {
    currentLocale,
    setLocale,
    toggleLocale,
    supportedLocales: SUPPORTED_LOCALES
  };
};
