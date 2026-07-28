import type { OefOrganizationNode } from './types'

export type OrgRefKind = 'element' | 'relationship' | 'view'

export type OrganizationImportWarningCode = 'relationsBranchSkipped'

export type OrganizationImportWarning = {
  code: OrganizationImportWarningCode
  message: string
  label?: string
}

export type PlannedDirectory = {
  tempKey: string
  name: string
  parentTempKey: string | null
}

export type OrganizationImportPlan = {
  directories: PlannedDirectory[]
  /** source element id → directory tempKey (or null = model root) */
  elementParentTempKey: Map<string, string | null>
  /** source view id → directory tempKey (or null = model root) */
  viewParentTempKey: Map<string, string | null>
  warnings: OrganizationImportWarning[]
}

function isFolder(
  node: OefOrganizationNode
): node is OefOrganizationNode & { children: OefOrganizationNode[] } {
  return Array.isArray(node.children)
}

function isLeaf(
  node: OefOrganizationNode
): node is OefOrganizationNode & { refId: string; refKind: OrgRefKind } {
  return typeof node.refId === 'string' && typeof node.refKind === 'string'
}

export function collectRefKinds(node: OefOrganizationNode): Set<OrgRefKind> {
  const kinds = new Set<OrgRefKind>()
  const visit = (n: OefOrganizationNode) => {
    if (isLeaf(n)) {
      kinds.add(n.refKind)
      return
    }
    if (isFolder(n)) {
      for (const child of n.children) visit(child)
    }
  }
  visit(node)
  return kinds
}

export function isRelationsOnlyBranch(node: OefOrganizationNode): boolean {
  const kinds = collectRefKinds(node)
  return kinds.size > 0 && [...kinds].every(kind => kind === 'relationship')
}

export function isViewsOnlyBranch(node: OefOrganizationNode): boolean {
  const kinds = collectRefKinds(node)
  return kinds.size > 0 && [...kinds].every(kind => kind === 'view')
}

function folderName(node: OefOrganizationNode, viewsOnly: boolean): string {
  const label = typeof node.label === 'string' ? node.label.trim() : ''
  if (label) return label
  return viewsOnly ? 'Views' : 'Folder'
}

/**
 * Build Directory plan + parent maps from OEF organizations (spec v1).
 */
export function buildOrganizationImportPlan(
  organizations: OefOrganizationNode[] | undefined | null
): OrganizationImportPlan {
  const directories: PlannedDirectory[] = []
  const elementParentTempKey = new Map<string, string | null>()
  const viewParentTempKey = new Map<string, string | null>()
  const warnings: OrganizationImportWarning[] = []
  let dirSeq = 0

  const nextDirKey = (path: string): string => {
    dirSeq += 1
    const safe = path.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 60)
    return `oef-dir-${dirSeq}-${safe || 'folder'}`
  }

  const visitFolder = (
    node: OefOrganizationNode,
    parentTempKey: string | null,
    pathLabel: string
  ): void => {
    if (!isFolder(node)) return
    if (isRelationsOnlyBranch(node)) {
      warnings.push({
        code: 'relationsBranchSkipped',
        label: node.label ?? undefined,
        message: `Skipped Relations organization branch "${node.label || pathLabel}"`,
      })
      return
    }

    const viewsOnly = isViewsOnlyBranch(node)
    const name = folderName(node, viewsOnly)
    const tempKey = nextDirKey(`${pathLabel}/${name}`)
    directories.push({ tempKey, name, parentTempKey })

    for (const child of node.children) {
      if (isLeaf(child)) {
        if (child.refKind === 'element') {
          if (!elementParentTempKey.has(child.refId)) {
            elementParentTempKey.set(child.refId, tempKey)
          }
        } else if (child.refKind === 'view') {
          if (!viewParentTempKey.has(child.refId)) {
            viewParentTempKey.set(child.refId, tempKey)
          }
        }
        // relationship leaves ignored inside non-relations-only (mixed) branches
        continue
      }
      if (isFolder(child)) {
        visitFolder(child, tempKey, `${pathLabel}/${name}`)
      }
    }
  }

  for (const root of organizations ?? []) {
    if (isFolder(root)) {
      visitFolder(root, null, '')
    } else if (isLeaf(root)) {
      if (root.refKind === 'element' && !elementParentTempKey.has(root.refId)) {
        elementParentTempKey.set(root.refId, null)
      }
      if (root.refKind === 'view' && !viewParentTempKey.has(root.refId)) {
        viewParentTempKey.set(root.refId, null)
      }
    }
  }

  return { directories, elementParentTempKey, viewParentTempKey, warnings }
}
