export const MODEL_PACKAGE_IMPORT_QUERY = 'package'

export function shouldOpenModelPackageImport(query: {
  import?: string | string[] | null
}): boolean {
  const value = query.import
  const raw = Array.isArray(value) ? value[0] : value
  return raw === MODEL_PACKAGE_IMPORT_QUERY
}
