import { formatDate } from '@/utils/formatDate'

type TranslateFn = (key: string, params?: Record<string, unknown>) => string

export function useActivityFormatting(t: TranslateFn, locale: { value: string }) {
  const formatRelativeDate = (dateStr?: string | null) => {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    if (Number.isNaN(d.getTime())) return ''
    const now = Date.now()
    const diff = now - d.getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return t('time.justNow')
    if (mins < 60) return t('time.minutesAgo', { count: mins })
    const hours = Math.floor(mins / 60)
    if (hours < 24) return t('time.hoursAgo', { count: hours })
    const days = Math.floor(hours / 24)
    if (days < 7) return t('time.daysAgo', { count: days })
    return formatDate(dateStr, locale.value)
  }

  const operationLabel = (op: string) => {
    switch (op.toUpperCase()) {
      case 'INSERT':
        return t('home.operationInsert')
      case 'UPDATE':
        return t('home.operationUpdate')
      case 'DELETE':
        return t('home.operationDelete')
      default:
        return op
    }
  }

  const operationIcon = (op: string) => {
    switch (op.toUpperCase()) {
      case 'INSERT':
        return 'add_circle'
      case 'UPDATE':
        return 'edit'
      case 'DELETE':
        return 'delete'
      default:
        return 'info'
    }
  }

  const operationColor = (op: string) => {
    switch (op.toUpperCase()) {
      case 'INSERT':
        return 'var(--success)'
      case 'UPDATE':
        return 'var(--primary)'
      case 'DELETE':
        return 'var(--danger)'
      default:
        return 'var(--text-subtle)'
    }
  }

  const tableLabel = (table: string) => {
    const map: Record<string, string> = {
      models: t('home.entityModel'),
      notations: t('home.entityNotation'),
      diagrams: t('home.entityDiagram'),
      nodes: t('home.entityNode'),
      links: t('home.entityLink'),
      components: t('home.entityComponent'),
      relations: 'Relation',
      relation_rules: t('home.entityRelationRule'),
      node_types: t('home.entityNodeType'),
      link_types: t('home.entityLinkType'),
    }
    return map[table] ?? table
  }

  return { formatRelativeDate, operationLabel, operationIcon, operationColor, tableLabel }
}
