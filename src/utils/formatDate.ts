export function formatDate(dateStr?: string | null, locale?: string): string {
  if (!dateStr) return "—"
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return "—"
  const dateLocale = locale === "en" ? "en-US" : "ru-RU"
  return new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium", timeStyle: "short" }).format(d)
}
