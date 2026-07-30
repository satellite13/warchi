<script setup lang="ts">
import { computed, ref } from "vue"
import { useRouter } from "vue-router"
import { useI18n } from "vue-i18n"
import AppHeader from "../components/layout/AppHeader.vue"
import MainLayout from "../layouts/MainLayout.vue"
import AppFooter from "../components/layout/AppFooter.vue"
import { useAuth } from "../composables/useAuth"
import { useDashboard } from "../composables/useDashboard"
import { useActivityFormatting } from "../composables/useActivityFormatting"
import { getUserDisplayName } from "../utils/userDisplay"
import { DEFAULT_ENTITY_ICONS } from "../config/iconOptions"
import CompactEntityRow from "../components/list/CompactEntityRow.vue"
import EmptyState from "../components/list/EmptyState.vue"
import { uploadNotationExportJson } from "@/features/notations/composables/uploadNotationExport"
import changelogRu from "../../CHANGELOG.ru.md?raw"
import changelogEn from "../../CHANGELOG.md?raw"

const router = useRouter()
const { t, locale } = useI18n()

const changelogRaw = computed(() => {
  if (locale.value === "ru") return changelogRu
  return changelogEn
})
const { currentUser } = useAuth()
const { isLoading, stats, totalVersions, recentModels, recentNotations, recentActivity } = useDashboard()
const appVersion = import.meta.env.APP_VERSION ?? "dev"

const notationPackageInputRef = ref<HTMLInputElement | null>(null)
const isImportingNotation = ref(false)
const importStatusMessage = ref<string | null>(null)
const importErrorMessage = ref<string | null>(null)

const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 6) return t("home.greetingNight")
  if (hour < 12) return t("home.greetingMorning")
  if (hour < 18) return t("home.greetingDay")
  return t("home.greetingEvening")
})

const userDisplayName = computed(() => {
  return getUserDisplayName(currentUser.value, t("common.user"))
})

const statCards = computed(() => [
  {
    key: "models",
    icon: DEFAULT_ENTITY_ICONS.model,
    label: t("home.models"),
    value: stats.value.models,
    sub: t("home.versions", { count: totalVersions.value.models }),
    color: "#7c5cfc",
    route: "models"
  },
  {
    key: "notations",
    icon: DEFAULT_ENTITY_ICONS.notation,
    label: t("home.notations"),
    value: stats.value.notations,
    sub: t("home.versions", { count: totalVersions.value.notations }),
    color: "#2bb896",
    route: "notations"
  },
  {
    key: "nodeTypes",
    icon: DEFAULT_ENTITY_ICONS.nodeType,
    label: t("home.nodeTypes"),
    value: stats.value.nodeTypes,
    sub: t("home.definitions"),
    color: "#f59e42",
    route: "types"
  },
  {
    key: "linkTypes",
    icon: DEFAULT_ENTITY_ICONS.link,
    label: t("home.linkTypes"),
    value: stats.value.linkTypes,
    sub: t("home.definitions"),
    color: "#e05a9e",
    route: "types"
  }
])

const quickActions = computed(() => [
  {
    key: "create-model",
    icon: "add_circle",
    label: t("home.quickCreateModel"),
    route: "models" as const,
    color: "#7c5cfc",
  },
  {
    key: "create-notation",
    icon: "add_circle",
    label: t("home.quickCreateNotation"),
    route: "notations" as const,
    color: "#2bb896",
  },
  {
    key: "import-notation",
    icon: "upload",
    label: t("home.quickImportNotation"),
    action: "import-notation" as const,
    color: "#2bb896",
  },
  {
    key: "type-editor",
    icon: DEFAULT_ENTITY_ICONS.nodeType,
    label: t("home.quickTypeEditor"),
    route: "types" as const,
    color: "#f59e42",
  },
])


const { formatRelativeDate, operationLabel, operationIcon, operationColor, tableLabel } =
  useActivityFormatting(t, locale)

const goTo = (name: string) => router.push({ name })

function openNotationPackagePicker() {
  if (isImportingNotation.value) return
  importErrorMessage.value = null
  importStatusMessage.value = null
  const input = notationPackageInputRef.value
  if (!input) return
  input.value = ""
  const withPicker = input as HTMLInputElement & { showPicker?: () => void }
  if (typeof withPicker.showPicker === "function") {
    withPicker.showPicker()
  } else {
    input.click()
  }
}

function handleQuickAction(action: (typeof quickActions.value)[number]) {
  if ("action" in action && action.action === "import-notation") {
    openNotationPackagePicker()
    return
  }
  if ("route" in action && action.route) {
    goTo(action.route)
  }
}

async function onNotationPackageSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ""
  if (!file || isImportingNotation.value) return

  isImportingNotation.value = true
  importErrorMessage.value = null
  importStatusMessage.value = t("notations.packageImporting")
  try {
    importStatusMessage.value = t("notations.packageImportProcessing")
    const result = await uploadNotationExportJson(file)

    if (!result.ok) {
      importStatusMessage.value = null
      if (result.code === "CONFLICT") {
        importErrorMessage.value = t("notations.packageImportConflict")
      } else if (result.status === 504 || result.status === 502) {
        importErrorMessage.value = t("notations.packageImportTimeout")
      } else if (result.code === "BAD_REQUEST") {
        importErrorMessage.value = result.message?.trim()
          ? t("notations.packageImportError", { message: result.message })
          : t("notations.packageImportBadRequest")
      } else {
        importErrorMessage.value = t("notations.packageImportError", { message: result.message })
      }
      return
    }

    importStatusMessage.value = null
    await router.push({ name: "notation-editor", params: { id: result.notationId } })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    importStatusMessage.value = null
    importErrorMessage.value = t("notations.packageImportError", { message })
  } finally {
    isImportingNotation.value = false
  }
}

const releaseNotes = computed(() => {
  const escapedVersion = appVersion.replace(/\./g, "\\.")
  const sectionPattern = new RegExp(`## \\[${escapedVersion}\\][^\\n]*\\n([\\s\\S]*?)(?=\\n## \\[|$)`)
  const match = changelogRaw.value.match(sectionPattern)
  if (!match?.[1]) return [] as string[]

  return match[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2))
})
</script>

<template>
  <MainLayout>
    <template #header>
      <AppHeader />
    </template>
    <template #default>
      <div class="dashboard" :aria-busy="isImportingNotation || undefined">
        <input
          ref="notationPackageInputRef"
          class="dashboard__package-input"
          type="file"
          accept=".json,application/json"
          @change="onNotationPackageSelected"
        />
        <div v-if="importErrorMessage" class="dashboard__import-error">{{ importErrorMessage }}</div>
        <div v-if="isImportingNotation" class="dashboard__busy">
          <UiIcon name="sync" class="dashboard__busy-icon spin" />
          <p class="dashboard__busy-message">
            {{ importStatusMessage || t("notations.packageImporting") }}
          </p>
        </div>
        <!-- Hero -->
        <section class="hero">
          <div class="hero__content">
            <h1 class="hero__greeting">
              {{ greeting }}<span class="hero__name">, {{ userDisplayName }}</span>
            </h1>
            <p class="hero__subtitle">{{ t("home.subtitle") }}</p>
          </div>
          <div class="hero__decoration">
            <div class="hero__orb hero__orb--1" />
            <div class="hero__orb hero__orb--2" />
            <div class="hero__orb hero__orb--3" />
          </div>
        </section>

        <!-- Stats -->
        <section class="stats-row">
          <button
            v-for="card in statCards"
            :key="card.key"
            type="button"
            class="stat-card"
            :style="{ '--stat-color': card.color }"
            @click="goTo(card.route)"
          >
            <div class="stat-card__icon-wrap">
              <UiIcon :name="card.icon" class="stat-card__icon" />
            </div>
            <div class="stat-card__data">
              <span class="stat-card__value" :class="{ 'stat-card__value--loading': isLoading }">
                {{ isLoading ? t("common.loadingDash") : card.value }}
              </span>
              <span class="stat-card__label">{{ card.label }}</span>
              <span class="stat-card__sub">{{ isLoading ? '' : card.sub }}</span>
            </div>
          </button>
        </section>

        <!-- Main Grid -->
        <div class="main-grid">
          <!-- Left: recent items -->
          <div class="main-grid__left">
            <!-- Recent Models -->
            <section class="section">
              <div class="section__header">
                <UiIcon name="schema" class="section__icon" />
                <h2 class="section__title">{{ t("home.sectionRecentModels") }}</h2>
                <button type="button" class="section__link" @click="goTo('models')">
                  {{ t("home.sectionAllModels") }}
                  <UiIcon name="arrow_forward" />
                </button>
              </div>
              <div v-if="isLoading" class="skeleton-list">
                <div v-for="i in 3" :key="i" class="skeleton-item" />
              </div>
              <EmptyState
                v-else-if="recentModels.length === 0"
                variant="compact"
                icon="folder_off"
                :title="t('home.sectionNoModels')"
              />
              <div v-else class="entity-list">
                <CompactEntityRow
                  v-for="item in recentModels"
                  :key="item.id"
                  :id="item.id"
                  :name="item.name"
                  :version="item.version"
                  :meta="formatRelativeDate(item.updatedAt)"
                  @click="router.push({ name: 'model-editor', params: { id: item.id } })"
                />
              </div>
            </section>

            <!-- Recent Notations -->
            <section class="section">
              <div class="section__header">
                <UiIcon name="account_tree" class="section__icon" />
                <h2 class="section__title">{{ t("home.sectionRecentNotations") }}</h2>
                <button type="button" class="section__link" @click="goTo('notations')">
                  {{ t("home.sectionAllNotations") }}
                  <UiIcon name="arrow_forward" />
                </button>
              </div>
              <div v-if="isLoading" class="skeleton-list">
                <div v-for="i in 3" :key="i" class="skeleton-item" />
              </div>
              <EmptyState
                v-else-if="recentNotations.length === 0"
                variant="compact"
                icon="folder_off"
                :title="t('home.sectionNoNotations')"
              />
              <div v-else class="entity-list">
                <CompactEntityRow
                  v-for="item in recentNotations"
                  :key="item.id"
                  :id="item.id"
                  :name="item.name"
                  :version="item.version"
                  :meta="formatRelativeDate(item.updatedAt)"
                  @click="router.push({ name: 'notation-editor', params: { id: item.id } })"
                />
              </div>
            </section>

            <section class="section release-notes">
              <div class="section__header">
                <UiIcon name="new_releases" class="section__icon" />
                <h2 class="section__title">{{ t("home.sectionReleaseNotes", { version: appVersion }) }}</h2>
              </div>
              <ul v-if="releaseNotes.length > 0" class="release-notes__list">
                <li v-for="(item, index) in releaseNotes" :key="`${index}-${item}`" class="release-notes__item">
                  {{ item }}
                </li>
              </ul>
              <EmptyState
                v-else
                variant="compact"
                icon="description"
                :title="t('home.sectionReleaseNotesEmpty')"
                class="section__empty--compact"
              />
            </section>
          </div>

          <!-- Right: activity + quick actions -->
          <div class="main-grid__right">
            <!-- Quick Actions -->
            <section class="section section--compact">
              <div class="section__header">
                <UiIcon name="bolt" class="section__icon" />
                <h2 class="section__title">{{ t("home.sectionQuickActions") }}</h2>
              </div>
              <div class="actions-grid">
                <button
                  v-for="action in quickActions"
                  :key="action.key"
                  type="button"
                  class="action-btn"
                  :style="{ '--action-color': action.color }"
                  :disabled="isImportingNotation"
                  @click="handleQuickAction(action)"
                >
                  <UiIcon :name="action.icon" class="action-btn__icon" />
                  <span class="action-btn__label">{{ action.label }}</span>
                </button>
              </div>
            </section>

            <!-- Activity Feed -->
            <section class="section section--grow">
              <div class="section__header">
                <UiIcon name="history" class="section__icon" />
                <h2 class="section__title">{{ t("home.sectionRecentActivity") }}</h2>
              </div>
              <div v-if="isLoading" class="skeleton-list">
                <div v-for="i in 5" :key="i" class="skeleton-item skeleton-item--sm" />
              </div>
              <EmptyState
                v-else-if="recentActivity.length === 0"
                variant="compact"
                icon="hourglass_empty"
                :title="t('home.sectionNoActivity')"
              />
              <div v-else class="activity-feed">
                <div
                  v-for="log in recentActivity"
                  :key="log.id"
                  class="activity-item"
                >
                  <div class="activity-item__icon" :style="{ color: operationColor(log.operation) }">
                    <UiIcon :name="operationIcon(log.operation)" />
                  </div>
                  <div class="activity-item__body">
                    <span class="activity-item__op">{{ operationLabel(log.operation) }}</span>
                    <span class="activity-item__entity">{{ tableLabel(log.tableName) }}</span>
                  </div>
                  <span class="activity-item__time">{{ formatRelativeDate(log.changedAt) }}</span>
                </div>
              </div>
            </section>
          </div>
        </div>

      </div>
    </template>
    <template #footer>
      <AppFooter />
    </template>
  </MainLayout>
</template>

<style scoped>
.dashboard {
  position: relative;
  padding: 28px 36px 36px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  height: 100%;
  overflow-y: auto;
  background: var(--base-bg);
}

.dashboard__package-input {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.dashboard__import-error {
  padding: 14px 16px;
  border-radius: var(--radius);
  background: var(--danger-soft);
  color: var(--danger);
  font-size: 14px;
  border: 1px solid rgba(239, 68, 68, 0.2);
}

.dashboard__busy {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 32px 16px;
  background: color-mix(in srgb, var(--base-bg) 88%, transparent);
  text-align: center;
}

.dashboard__busy-icon {
  width: 28px;
  height: 28px;
}

.dashboard__busy-icon.spin {
  animation: dashboard-spin 1s linear infinite;
}

.dashboard__busy-message {
  margin: 0;
  max-width: 420px;
  font-size: 15px;
  font-weight: 500;
  color: var(--base-text);
}

@keyframes dashboard-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(-360deg);
  }
}

/* ── Hero ── */
.hero {
  position: relative;
  padding: 36px 36px;
  min-height: 60px;
  border-radius: var(--radius);
  background: var(--surface);
  border: 1px solid var(--border);
  overflow: hidden;
}

.hero__content {
  position: relative;
  z-index: 1;
  max-width: min(100%, 760px);
}

.hero__greeting {
  margin: 0;
  font-size: 26px;
  font-weight: 600;
  color: var(--base-text);
  letter-spacing: -0.02em;
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.hero__name {
  display: inline;
  background: linear-gradient(135deg, var(--primary) 0%, #b06cff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  overflow-wrap: anywhere;
}

.hero__subtitle {
  margin: 6px 0 0;
  font-size: 14px;
  line-height: 1.4;
  color: var(--text-muted);
  overflow-wrap: anywhere;
}

.hero__decoration {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

.hero__orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(60px);
  opacity: 0.08;
}

.hero__orb--1 {
  width: 260px;
  height: 260px;
  background: var(--primary);
  right: -40px;
  top: -80px;
  animation: orbFloat1 12s ease-in-out infinite;
}

.hero__orb--2 {
  width: 180px;
  height: 180px;
  background: var(--accent);
  right: 160px;
  bottom: -60px;
  animation: orbFloat2 10s ease-in-out infinite;
}

.hero__orb--3 {
  width: 120px;
  height: 120px;
  background: #f472b6;
  right: 40%;
  top: -30px;
  animation: orbFloat3 14s ease-in-out infinite;
}

@keyframes orbFloat1 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(-20px, 15px) scale(1.1); }
}

@keyframes orbFloat2 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(15px, -10px) scale(0.9); }
}

@keyframes orbFloat3 {
  0%, 100% { transform: translate(0, 0); }
  50% { transform: translate(10px, 8px); }
}

/* ── Stats Row ── */
.stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 20px;
  border-radius: var(--radius);
  background: var(--surface);
  border: 1px solid var(--border);
  cursor: pointer;
  transition: all 0.25s ease;
  text-align: left;
}

.stat-card:hover {
  border-color: var(--stat-color);
  box-shadow: 0 4px 16px color-mix(in srgb, var(--stat-color) 12%, transparent);
  transform: translateY(-2px);
}

.stat-card__icon-wrap {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--stat-color) 10%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.stat-card__icon {
  width: 22px;
  height: 22px;
  color: var(--stat-color);
}

.stat-card__data {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.stat-card__value {
  font-size: 28px;
  font-weight: 700;
  color: var(--base-text);
  letter-spacing: -0.03em;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.stat-card__value--loading {
  color: var(--text-subtle);
}

.stat-card__label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted);
  margin-top: 2px;
}

.stat-card__sub {
  font-size: 11px;
  color: var(--text-subtle);
  margin-top: 1px;
}

/* ── Main Grid ── */
.main-grid {
  display: grid;
  grid-template-columns: 1fr 380px;
  gap: 20px;
  align-items: start;
  min-height: 0;
}

.main-grid__left {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-height: 0;
}

.main-grid__right {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-height: 0;
}

/* ── Section ── */
.section {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 20px;
  display: flex;
  flex-direction: column;
}

.section--compact {
  padding: 16px 20px;
}

.section--grow {
  flex: 0 0 320px;
  min-height: 320px;
  max-height: 320px;
  overflow: hidden;
}

.section__header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.section__icon {
  width: 18px;
  height: 18px;
  color: var(--text-subtle);
}

.section__title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--base-text);
  letter-spacing: -0.01em;
}

.section__link {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 500;
  color: var(--primary);
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: background 0.15s;
}

.section__link:hover {
  background: var(--primary-soft);
}

.section__link .ui-icon {
  width: 14px;
  height: 14px;
}

.section__empty--compact {
  padding: 8px 0 2px;
}

.release-notes {
  padding: 18px 20px;
}

.release-notes__list {
  margin: 0;
  padding: 0 0 0 18px;
  display: grid;
  gap: 8px;
}

.release-notes__item {
  font-size: 13px;
  color: var(--text-muted);
  line-height: 1.4;
}

/* ── Entity List ── */
.entity-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* ── Quick Actions ── */
.actions-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 14px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--surface-muted);
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;
}

.action-btn:hover {
  border-color: var(--action-color);
  background: color-mix(in srgb, var(--action-color) 6%, var(--surface));
  transform: translateX(2px);
}

.action-btn__icon {
  width: 20px;
  height: 20px;
  color: var(--action-color);
}

.action-btn__label {
  font-size: 13px;
  font-weight: 500;
  color: var(--base-text);
}

/* ── Activity Feed ── */
.activity-feed {
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

.activity-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 6px;
  border-radius: 8px;
  transition: background 0.15s;
}

.activity-item:hover {
  background: var(--surface-muted);
}

.activity-item__icon {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: var(--surface-strong);
}

.activity-item__icon .ui-icon {
  width: 15px;
  height: 15px;
}

.activity-item__body {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.activity-item__op {
  font-size: 12px;
  font-weight: 600;
  color: var(--base-text);
}

.activity-item__entity {
  font-size: 12px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.activity-item__time {
  font-size: 11px;
  color: var(--text-subtle);
  white-space: nowrap;
  flex-shrink: 0;
}

/* ── Skeletons ── */
.skeleton-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.skeleton-item {
  height: 56px;
  border-radius: var(--radius-sm);
  background: linear-gradient(90deg, var(--surface-strong) 25%, var(--surface-muted) 50%, var(--surface-strong) 75%);
  background-size: 400% 100%;
  animation: shimmer 1.8s ease infinite;
}

.skeleton-item--sm {
  height: 40px;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* ── Entry animations ── */
.hero {
  animation: slideUp 0.5s ease both;
}

.stats-row {
  animation: slideUp 0.5s ease 0.08s both;
}

.main-grid {
  animation: slideUp 0.5s ease 0.16s both;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ── Responsive ── */
@media (max-width: 1100px) {
  .stats-row {
    grid-template-columns: repeat(2, 1fr);
  }

  .main-grid {
    grid-template-columns: 1fr;
  }

  .main-grid__right {
    flex-direction: row;
    gap: 20px;
  }

  .section--grow {
    max-height: 360px;
  }
}

@media (max-width: 640px) {
  .dashboard {
    padding: 16px;
  }

  .stats-row {
    grid-template-columns: 1fr;
  }

  .hero__greeting {
    font-size: 20px;
  }

  .main-grid__right {
    flex-direction: column;
  }
}
</style>
