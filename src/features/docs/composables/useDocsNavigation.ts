import { computed, ref, watch } from "vue"
import { useRoute } from "vue-router"
import type { DocSection } from "../types"

const contentModules: Record<string, () => Promise<{ default: string }>> = {
  overview: () => import("../content/overview.md?raw"),
  models: () => import("../content/models.md?raw"),
  notations: () => import("../content/notations.md?raw"),
  diagrams: () => import("../content/diagrams.md?raw"),
  types: () => import("../content/types.md?raw"),
  hotkeys: () => import("../content/hotkeys.md?raw"),
  changelog: () => import("../../../../CHANGELOG.ru.md?raw"),
  faq: () => import("../content/faq.md?raw"),
}

export const sections: DocSection[] = [
  { id: "overview", title: "Обзор системы", icon: "info" },
  { id: "models", title: "Модели", icon: "schema" },
  { id: "notations", title: "Нотации", icon: "graph_3" },
  { id: "diagrams", title: "Диаграммы", icon: "dashboard" },
  { id: "types", title: "Типы", icon: "category" },
  { id: "hotkeys", title: "Горячие клавиши", icon: "keyboard" },
  { id: "changelog", title: "История изменений", icon: "history" },
  { id: "faq", title: "FAQ", icon: "help" },
]

export function useDocsNavigation() {
  const route = useRoute()
  const rawContent = ref("")
  const isLoading = ref(false)

  const currentSection = computed(() => {
    const section = route.params.section as string
    return section || "overview"
  })

  async function loadSectionContent(id: string) {
    const loader = contentModules[id]
    if (!loader) {
      rawContent.value = "# Раздел не найден\n\nЗапрашиваемый раздел документации не существует."
      return
    }
    isLoading.value = true
    try {
      const mod = await loader()
      rawContent.value = mod.default
    } catch {
      rawContent.value = "# Ошибка загрузки\n\nНе удалось загрузить содержимое раздела."
    } finally {
      isLoading.value = false
    }
  }

  watch(currentSection, (id) => loadSectionContent(id), { immediate: true })

  return {
    sections,
    currentSection,
    rawContent,
    isLoading,
  }
}
