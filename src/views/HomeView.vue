<script setup lang="ts">
import { computed } from "vue"
import { useRouter } from "vue-router"
import AppHeader from "../components/layout/AppHeader.vue"
import MainLayout from "../layouts/MainLayout.vue"
import AppFooter from "../components/layout/AppFooter.vue"
import { useAuth } from "../composables/useAuth"
import { useDashboard } from "../composables/useDashboard"
import changelogRaw from "../../CHANGELOG.md?raw"

const router = useRouter()
const { currentUser } = useAuth()
const { isLoading, stats, totalVersions, recentModels, recentNotations, recentActivity } = useDashboard()
const appVersion = "0.0.4"

const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 6) return "Доброй ночи"
  if (hour < 12) return "Доброе утро"
  if (hour < 18) return "Добрый день"
  return "Добрый вечер"
})

const userDisplayName = computed(() => {
  const email = currentUser.value?.email ?? ""
  return email.split("@")[0] || "пользователь"
})

const statCards = computed(() => [
  {
    key: "models",
    icon: "schema",
    label: "Модели",
    value: stats.value.models,
    sub: `${totalVersions.value.models} версий`,
    color: "#7c5cfc",
    route: "models"
  },
  {
    key: "notations",
    icon: "graph_3",
    label: "Нотации",
    value: stats.value.notations,
    sub: `${totalVersions.value.notations} версий`,
    color: "#2bb896",
    route: "notations"
  },
  {
    key: "nodeTypes",
    icon: "category",
    label: "Типы нод",
    value: stats.value.nodeTypes,
    sub: "определений",
    color: "#f59e42",
    route: "types"
  },
  {
    key: "linkTypes",
    icon: "link",
    label: "Типы связей",
    value: stats.value.linkTypes,
    sub: "определений",
    color: "#e05a9e",
    route: "types"
  }
])

const quickActions = [
  { icon: "add_circle", label: "Создать модель", route: "models", color: "#7c5cfc" },
  { icon: "add_circle", label: "Создать нотацию", route: "notations", color: "#2bb896" },
  { icon: "tune", label: "Редактор типов", route: "types", color: "#f59e42" }
]

const gradientColors = [
  "linear-gradient(135deg, #7c5cfc 0%, #b06cff 100%)",
  "linear-gradient(135deg, #45e0b8 0%, #7c5cfc 100%)",
  "linear-gradient(135deg, #f472b6 0%, #ec4899 100%)",
  "linear-gradient(135deg, #38bdf8 0%, #818cf8 100%)",
  "linear-gradient(135deg, #fb923c 0%, #f472b6 100%)",
  "linear-gradient(135deg, #34d399 0%, #38bdf8 100%)",
  "linear-gradient(135deg, #fbbf24 0%, #fb923c 100%)",
  "linear-gradient(135deg, #a78bfa 0%, #f472b6 100%)"
]

const getGradient = (id: string) => {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash)
  return gradientColors[Math.abs(hash) % gradientColors.length]
}

const formatDate = (dateStr?: string | null) => {
  if (!dateStr) return "—"
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return "—"
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(d)
}

const formatRelativeDate = (dateStr?: string | null) => {
  if (!dateStr) return ""
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return ""
  const now = Date.now()
  const diff = now - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "только что"
  if (mins < 60) return `${mins} мин назад`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} ч назад`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} дн назад`
  return formatDate(dateStr)
}

const operationLabel = (op: string) => {
  switch (op.toUpperCase()) {
    case "INSERT": return "Создание"
    case "UPDATE": return "Изменение"
    case "DELETE": return "Удаление"
    default: return op
  }
}

const operationIcon = (op: string) => {
  switch (op.toUpperCase()) {
    case "INSERT": return "add_circle"
    case "UPDATE": return "edit"
    case "DELETE": return "delete"
    default: return "info"
  }
}

const operationColor = (op: string) => {
  switch (op.toUpperCase()) {
    case "INSERT": return "var(--success)"
    case "UPDATE": return "var(--primary)"
    case "DELETE": return "var(--danger)"
    default: return "var(--text-subtle)"
  }
}

const tableLabel = (table: string) => {
  const map: Record<string, string> = {
    models: "Модель",
    notations: "Нотация",
    diagrams: "Диаграмма",
    nodes: "Нода",
    links: "Связь",
    components: "Компонент",
    relations: "Relation",
    relation_rules: "Правило",
    node_types: "Тип ноды",
    link_types: "Тип связи"
  }
  return map[table] ?? table
}

const goTo = (name: string) => router.push({ name })

const releaseNotes = computed(() => {
  const escapedVersion = appVersion.replace(/\./g, "\\.")
  const sectionPattern = new RegExp(`## \\[${escapedVersion}\\][^\\n]*\\n([\\s\\S]*?)(?=\\n## \\[|$)`)
  const match = changelogRaw.match(sectionPattern)
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
      <div class="dashboard">
        <!-- Hero -->
        <section class="hero">
          <div class="hero__content">
            <h1 class="hero__greeting">
              {{ greeting }}<span class="hero__name">, {{ userDisplayName }}</span>
            </h1>
            <p class="hero__subtitle">Архитектурный репозиторий wArchi</p>
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
              <span class="material-symbols-outlined stat-card__icon">{{ card.icon }}</span>
            </div>
            <div class="stat-card__data">
              <span class="stat-card__value" :class="{ 'stat-card__value--loading': isLoading }">
                {{ isLoading ? '—' : card.value }}
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
                <span class="material-symbols-outlined section__icon">schema</span>
                <h2 class="section__title">Недавние модели</h2>
                <button type="button" class="section__link" @click="goTo('models')">
                  Все модели
                  <span class="material-symbols-outlined">arrow_forward</span>
                </button>
              </div>
              <div v-if="isLoading" class="skeleton-list">
                <div v-for="i in 3" :key="i" class="skeleton-item" />
              </div>
              <div v-else-if="recentModels.length === 0" class="section__empty">
                <span class="material-symbols-outlined">folder_off</span>
                <span>Моделей пока нет</span>
              </div>
              <div v-else class="entity-list">
                <button
                  v-for="item in recentModels"
                  :key="item.id"
                  type="button"
                  class="entity-row"
                  @click="router.push({ name: 'model-editor', params: { id: item.id } })"
                >
                  <div class="entity-row__gradient" :style="{ background: getGradient(item.id) }" />
                  <div class="entity-row__body">
                    <span class="entity-row__name">{{ item.name }}</span>
                    <span class="entity-row__version">v{{ item.version }}</span>
                  </div>
                  <span class="entity-row__date">{{ formatRelativeDate(item.updatedAt) }}</span>
                </button>
              </div>
            </section>

            <!-- Recent Notations -->
            <section class="section">
              <div class="section__header">
                <span class="material-symbols-outlined section__icon">graph_3</span>
                <h2 class="section__title">Недавние нотации</h2>
                <button type="button" class="section__link" @click="goTo('notations')">
                  Все нотации
                  <span class="material-symbols-outlined">arrow_forward</span>
                </button>
              </div>
              <div v-if="isLoading" class="skeleton-list">
                <div v-for="i in 3" :key="i" class="skeleton-item" />
              </div>
              <div v-else-if="recentNotations.length === 0" class="section__empty">
                <span class="material-symbols-outlined">folder_off</span>
                <span>Нотаций пока нет</span>
              </div>
              <div v-else class="entity-list">
                <button
                  v-for="item in recentNotations"
                  :key="item.id"
                  type="button"
                  class="entity-row"
                  @click="router.push({ name: 'notation-editor', params: { id: item.id } })"
                >
                  <div class="entity-row__gradient" :style="{ background: getGradient(item.id) }" />
                  <div class="entity-row__body">
                    <span class="entity-row__name">{{ item.name }}</span>
                    <span class="entity-row__version">v{{ item.version }}</span>
                  </div>
                  <span class="entity-row__date">{{ formatRelativeDate(item.updatedAt) }}</span>
                </button>
              </div>
            </section>

            <section class="section release-notes">
              <div class="section__header">
                <span class="material-symbols-outlined section__icon">new_releases</span>
                <h2 class="section__title">Изменения в версии v{{ appVersion }}</h2>
              </div>
              <ul v-if="releaseNotes.length > 0" class="release-notes__list">
                <li v-for="(item, index) in releaseNotes" :key="`${index}-${item}`" class="release-notes__item">
                  {{ item }}
                </li>
              </ul>
              <div v-else class="section__empty section__empty--compact">
                <span class="material-symbols-outlined">description</span>
                <span>Нет записей в changelog для текущей версии</span>
              </div>
            </section>
          </div>

          <!-- Right: activity + quick actions -->
          <div class="main-grid__right">
            <!-- Quick Actions -->
            <section class="section section--compact">
              <div class="section__header">
                <span class="material-symbols-outlined section__icon">bolt</span>
                <h2 class="section__title">Быстрые действия</h2>
              </div>
              <div class="actions-grid">
                <button
                  v-for="action in quickActions"
                  :key="action.label"
                  type="button"
                  class="action-btn"
                  :style="{ '--action-color': action.color }"
                  @click="goTo(action.route)"
                >
                  <span class="material-symbols-outlined action-btn__icon">{{ action.icon }}</span>
                  <span class="action-btn__label">{{ action.label }}</span>
                </button>
              </div>
            </section>

            <!-- Activity Feed -->
            <section class="section section--grow">
              <div class="section__header">
                <span class="material-symbols-outlined section__icon">history</span>
                <h2 class="section__title">Последние действия</h2>
              </div>
              <div v-if="isLoading" class="skeleton-list">
                <div v-for="i in 5" :key="i" class="skeleton-item skeleton-item--sm" />
              </div>
              <div v-else-if="recentActivity.length === 0" class="section__empty">
                <span class="material-symbols-outlined">hourglass_empty</span>
                <span>Действий пока нет</span>
              </div>
              <div v-else class="activity-feed">
                <div
                  v-for="log in recentActivity"
                  :key="log.id"
                  class="activity-item"
                >
                  <div class="activity-item__icon" :style="{ color: operationColor(log.operation) }">
                    <span class="material-symbols-outlined">{{ operationIcon(log.operation) }}</span>
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
  padding: 28px 36px 36px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  height: 100%;
  overflow-y: auto;
  background: var(--base-bg);
}

/* ── Hero ── */
.hero {
  position: relative;
  padding: 32px 36px;
  border-radius: var(--radius);
  background: var(--surface);
  border: 1px solid var(--border);
  overflow: hidden;
}

.hero__content {
  position: relative;
  z-index: 1;
}

.hero__greeting {
  margin: 0;
  font-size: 26px;
  font-weight: 600;
  color: var(--base-text);
  letter-spacing: -0.02em;
  line-height: 1.2;
}

.hero__name {
  background: linear-gradient(135deg, var(--primary) 0%, #b06cff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.hero__subtitle {
  margin: 6px 0 0;
  font-size: 14px;
  color: var(--text-muted);
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
  font-size: 22px;
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
  font-size: 18px;
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

.section__link .material-symbols-outlined {
  font-size: 14px;
}

.section__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 28px 0;
  color: var(--text-subtle);
  font-size: 13px;
}

.section__empty--compact {
  padding: 8px 0 2px;
}

.section__empty .material-symbols-outlined {
  font-size: 32px;
  opacity: 0.5;
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

.entity-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  background: var(--surface-muted);
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;
}

.entity-row:hover {
  background: var(--surface-strong);
  border-color: var(--border);
  transform: translateX(2px);
}

.entity-row__gradient {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  flex-shrink: 0;
  position: relative;
  overflow: hidden;
}

.entity-row__gradient::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, transparent 40%, rgba(0, 0, 0, 0.12) 100%);
}

.entity-row__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.entity-row__name {
  font-size: 13px;
  font-weight: 600;
  color: var(--base-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.entity-row__version {
  font-size: 11px;
  color: var(--text-subtle);
  font-variant-numeric: tabular-nums;
}

.entity-row__date {
  font-size: 11px;
  color: var(--text-subtle);
  white-space: nowrap;
  flex-shrink: 0;
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
  font-size: 20px;
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

.activity-item__icon .material-symbols-outlined {
  font-size: 15px;
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
