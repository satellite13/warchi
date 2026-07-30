import { computed, ref, watch } from "vue"
import { useRoute } from "vue-router"
import { useI18n } from "vue-i18n"
import type { DocSection } from "../types"
const contentModules: Record<
  "ru" | "en",
  Record<string, () => Promise<{ default: string }>>
> = {
  ru: {
    overview: () => import("../content/overview.md?raw"),
    dashboard: () => import("../content/dashboard.md?raw"),
    auth: () => import("../content/auth.md?raw"),
    profile: () => import("../content/profile.md?raw"),
    models: () => import("../content/models.md?raw"),
    versionTree: () => import("../content/version-tree.md?raw"),
    notations: () => import("../content/notations.md?raw"),
    diagrams: () => import("../content/diagrams.md?raw"),
    types: () => import("../content/types.md?raw"),
    shapes: () => import("../content/shapes.md?raw"),
    wiki: () => import("../content/wiki.md?raw"),
    validationScripts: () => import("../content/validation-scripts.md?raw"),
    admin: () => import("../content/admin.md?raw"),
    hotkeys: () => import("../content/hotkeys.md?raw"),
    changelog: () => import("../../../../CHANGELOG.ru.md?raw"),
    faq: () => import("../content/faq.md?raw"),
  },
  en: {
    overview: () => import("../content/overview.en.md?raw"),
    dashboard: () => import("../content/dashboard.en.md?raw"),
    auth: () => import("../content/auth.en.md?raw"),
    profile: () => import("../content/profile.en.md?raw"),
    models: () => import("../content/models.en.md?raw"),
    versionTree: () => import("../content/version-tree.en.md?raw"),
    notations: () => import("../content/notations.en.md?raw"),
    diagrams: () => import("../content/diagrams.en.md?raw"),
    types: () => import("../content/types.en.md?raw"),
    shapes: () => import("../content/shapes.en.md?raw"),
    wiki: () => import("../content/wiki.en.md?raw"),
    validationScripts: () => import("../content/validation-scripts.en.md?raw"),
    admin: () => import("../content/admin.en.md?raw"),
    hotkeys: () => import("../content/hotkeys.en.md?raw"),
    changelog: () => import("../../../../CHANGELOG.md?raw"),
    faq: () => import("../content/faq.en.md?raw"),
  },
}

export const sections: DocSection[] = [
  { id: "overview", title: "Обзор системы", icon: "info" },
  { id: "dashboard", title: "Главная", icon: "space_dashboard" },
  { id: "auth", title: "Авторизация", icon: "lock" },
  { id: "profile", title: "Профиль", icon: "account_circle" },
  { id: "models", title: "Модели", icon: "schema" },
  { id: "versionTree", title: "Дерево версий", icon: "device_hub" },
  { id: "notations", title: "Нотации", icon: "account_tree" },
  { id: "diagrams", title: "Диаграммы", icon: "dashboard" },
  { id: "types", title: "Типы", icon: "category" },
  { id: "shapes", title: "Формы", icon: "hexagon" },
  { id: "wiki", title: "Wiki", icon: "library_books" },
  { id: "validationScripts", title: "Скрипты", icon: "terminal" },
  { id: "admin", title: "Администрирование", icon: "admin_panel_settings" },
  { id: "hotkeys", title: "Горячие клавиши", icon: "keyboard" },
  { id: "changelog", title: "История изменений", icon: "history" },
  { id: "faq", title: "FAQ", icon: "help" },
]

export function useDocsNavigation() {
  const route = useRoute()
  const { locale, t } = useI18n()
  const rawContent = ref("")
  const isLoading = ref(false)

  const currentSection = computed(() => {
    const section = route.params.section as string
    return section || "overview"
  })

  const effectiveDocsLocale = computed((): "ru" | "en" => {
    if (locale.value === "ru") return "ru"
    return "en"
  })

  async function loadSectionContent(id: string) {
    const modules = contentModules[effectiveDocsLocale.value]
    const loader = modules[id]
    if (!loader) {
      rawContent.value = `# ${t("docs.notFound")}\n\n${t("docs.notFoundDesc")}`
      return
    }
    isLoading.value = true
    try {
      const mod = await loader()
      rawContent.value = mod.default
    } catch {
      rawContent.value = `# ${t("docs.loadError")}\n\n${t("docs.loadErrorDesc")}`
    } finally {
      isLoading.value = false
    }
  }

  watch(
    [currentSection, effectiveDocsLocale],
    ([id]) => loadSectionContent(id as string),
    { immediate: true }
  )

  return {
    sections,
    currentSection,
    rawContent,
    isLoading,
  }
}
