import { shallowRef, type Ref } from 'vue'

export interface ClipboardNodePayload {
  nodeTypeId: string
  name: string
  attrs: Record<string, unknown> | null
}

/** Единый буфер копирования на сессию (модульное состояние, как в useFavorites). */
// shallowRef: буфер должен хранить плоский (не-Proxy) объект. Глубокий reactive
// ref превращает attrs в Proxy, и последующий structuredClone в потребителях
// падает с DataCloneError («вставить» молча не работает).
const copied: Ref<ClipboardNodePayload | null> = shallowRef(null)

/** Признак автосозданного синком узла — единый guard (dpc/typeProperties.autoCreated). */
const isAutoCreatedAttrs = (attrs: Record<string, unknown> | null): boolean => {
  const dpc = attrs?.dpc as { autoCreated?: boolean } | undefined
  if (dpc?.autoCreated === true) return true
  const typeProperties = attrs?.typeProperties as { autoCreated?: boolean } | undefined
  return typeProperties?.autoCreated === true
}

export function useNodeClipboard(): {
  copied: Ref<ClipboardNodePayload | null>
  copyNode: (payload: ClipboardNodePayload) => void
  takeCopied: () => ClipboardNodePayload | null
  clear: () => void
} {
  /** Копирует ручной узел в буфер; автосозданные (sync) — игнорируются. */
  function copyNode(payload: ClipboardNodePayload): void {
    if (isAutoCreatedAttrs(payload.attrs)) return
    // JSON-клон (не structuredClone): attrs источника может быть reactive-Proxy
    // (parsedAttrs узла редактора), а structuredClone на Proxy бросает DataCloneError.
    const flatAttrs = payload.attrs
      ? (JSON.parse(JSON.stringify(payload.attrs)) as Record<string, unknown>)
      : null
    if (flatAttrs) {
      // dpc (kind/id/autoCreated) и oef (entityId) — скоупы источника: в копию не переносятся.
      delete flatAttrs.dpc
      delete flatAttrs.oef
    }
    copied.value = {
      nodeTypeId: payload.nodeTypeId,
      name: payload.name,
      attrs: flatAttrs,
    }
  }

  /** Отдаёт копию payload; буфер НЕ очищается — вставка разрешена многократно. */
  function takeCopied(): ClipboardNodePayload | null {
    return copied.value ? { ...copied.value } : null
  }

  function clear(): void {
    copied.value = null
  }

  return { copied, copyNode, takeCopied, clear }
}

/**
 * Имя вставляемой копии без коллизий среди существующих детей папки:
 * 'A' → 'A (copy)' → 'A (copy 2)' → 'A (copy 3)' …
 */
export function uniquePasteName(base: string, existingNames: readonly string[]): string {
  const taken = new Set(existingNames.map(name => name.trim()))
  if (!taken.has(base.trim())) return base
  let suffix = 1
  while (true) {
    const candidate = suffix === 1 ? `${base} (copy)` : `${base} (copy ${suffix})`
    if (!taken.has(candidate)) return candidate
    suffix += 1
  }
}

/**
 * Тип скопированной ноды должен существовать в целевой модели: буфер переживает
 * смену модели, а неизвестный тип дал бы ноду без схемы (defaults молча пропущены).
 */
export function isPasteableNodeType(
  payload: Pick<ClipboardNodePayload, 'nodeTypeId'>,
  nodeTypes: readonly { id: string }[]
): boolean {
  return nodeTypes.some(nodeType => nodeType.id === payload.nodeTypeId)
}
