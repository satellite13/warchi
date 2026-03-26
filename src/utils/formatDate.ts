export function formatDate(dateStr?: string | null, locale?: string, includeTime = true): string {
  if (!dateStr) return "—"
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return "—"
  const dateLocale =
    locale === "en" ? "en-US" : locale === "fr" ? "fr-FR" : "ru-RU"
  const options: Intl.DateTimeFormatOptions = includeTime
    ? { dateStyle: "medium", timeStyle: "short" }
    : { dateStyle: "medium" }
  return new Intl.DateTimeFormat(dateLocale, options).format(d)
}
