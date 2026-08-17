<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import PatchPropertyEditor from './PatchPropertyEditor.vue'
import type {
  CompositeSerializedCComponent,
  CustomProperty,
  StylePropertyBindingGroup,
  StyleBindingWhen,
} from '@/domain/attrs/notationAttrs'

const props = defineProps<{
  modelValue: StylePropertyBindingGroup[]
  componentProperties: CustomProperty[]
  nodeTypeProperties: CustomProperty[]
  targetOptions: Array<{ id: string; label: string }>
  treeNodes?: Array<{ node: CompositeSerializedCComponent }>
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: StylePropertyBindingGroup[]): void
}>()
const { t } = useI18n()

const outerTarget = { id: '__compositeOuter__', label: '__compositeOuter__' }

const groups = computed(() => props.modelValue ?? [])

function nextWhenForType(type: CustomProperty['type'] | undefined): StyleBindingWhen {
  if (type === 'number') return { op: 'equals', value: 0 }
  if (type === 'boolean') return { op: 'is', value: false }
  return { op: 'equals', value: '' }
}

function getPropertyType(group: StylePropertyBindingGroup): CustomProperty['type'] | undefined {
  const src = group.valueSource === 'component' ? props.componentProperties : props.nodeTypeProperties
  return src.find((p) => p.name === group.propertyName)?.type
}

function cloneGroups(): StylePropertyBindingGroup[] {
  return JSON.parse(JSON.stringify(props.modelValue ?? [])) as StylePropertyBindingGroup[]
}

function updateGroups(next: StylePropertyBindingGroup[]): void {
  emit('update:modelValue', next)
}

function addGroup(): void {
  const next = cloneGroups()
  next.push({
    valueSource: 'component',
    propertyName: props.componentProperties[0]?.name ?? '',
    branches: [
      {
        when: nextWhenForType(props.componentProperties[0]?.type),
        patches: [{ targetId: '__compositeOuter__', patch: {} }],
      },
    ],
  })
  updateGroups(next)
}

function removeGroup(groupIdx: number): void {
  const next = cloneGroups()
  next.splice(groupIdx, 1)
  updateGroups(next)
}

function changeSource(groupIdx: number, valueSource: 'component' | 'nodeType'): void {
  const next = cloneGroups()
  const group = next[groupIdx]
  if (!group) return
  group.valueSource = valueSource
  const list = valueSource === 'component' ? props.componentProperties : props.nodeTypeProperties
  group.propertyName = list[0]?.name ?? ''
  group.branches = [
    {
      when: nextWhenForType(list[0]?.type),
      patches: [{ targetId: '__compositeOuter__', patch: {} }],
    },
  ]
  updateGroups(next)
}

function changeProperty(groupIdx: number, propertyName: string): void {
  const next = cloneGroups()
  const group = next[groupIdx]
  if (!group) return
  group.propertyName = propertyName
  const type = getPropertyType(group)
  group.branches = group.branches.map((branch) => ({
    ...branch,
    when: nextWhenForType(type),
  }))
  updateGroups(next)
}

function setWhenOperator(groupIdx: number, branchIdx: number, op: StyleBindingWhen['op']): void {
  const next = cloneGroups()
  const group = next[groupIdx]
  const branch = group?.branches[branchIdx]
  if (!group || !branch) return

  if (op === 'isEmpty' || op === 'isNotEmpty') {
    branch.when = { op }
  } else if (op === 'is') {
    branch.when = { op, value: false }
  } else if (op === 'range') {
    branch.when = { op, min: 0, max: 100 }
  } else if (op === 'contains' || op === 'matchesRegex') {
    branch.when = { op, value: '' }
  } else {
    branch.when = { op, value: 0 }
  }
  updateGroups(next)
}

function addBranch(groupIdx: number): void {
  const next = cloneGroups()
  const group = next[groupIdx]
  if (!group) return
  group.branches.push({
    when: nextWhenForType(getPropertyType(group)),
    patches: [{ targetId: '__compositeOuter__', patch: {} }],
  })
  updateGroups(next)
}

function removeBranch(groupIdx: number, branchIdx: number): void {
  const next = cloneGroups()
  const group = next[groupIdx]
  if (!group) return
  group.branches.splice(branchIdx, 1)
  updateGroups(next)
}

function addPatch(groupIdx: number, branchIdx: number): void {
  const next = cloneGroups()
  const branch = next[groupIdx]?.branches[branchIdx]
  if (!branch) return
  branch.patches.push({ targetId: '__compositeOuter__', patch: {} })
  updateGroups(next)
}

function removePatch(groupIdx: number, branchIdx: number, patchIdx: number): void {
  const next = cloneGroups()
  const branch = next[groupIdx]?.branches[branchIdx]
  if (!branch) return
  branch.patches.splice(patchIdx, 1)
  updateGroups(next)
}

function setPatchObject(
  groupIdx: number,
  branchIdx: number,
  patchIdx: number,
  value: Record<string, unknown>,
): void {
  const next = cloneGroups()
  const patch = next[groupIdx]?.branches[branchIdx]?.patches[patchIdx]
  if (!patch) return
  patch.patch = value
  updateGroups(next)
}

const flatTreeNodes = computed(() => props.treeNodes ?? [])

function setWhenString(groupIdx: number, branchIdx: number, key: 'value' | 'min' | 'max', value: string): void {
  const next = cloneGroups()
  const when = next[groupIdx]?.branches[branchIdx]?.when as Record<string, unknown> | undefined
  if (!when) return
  if (key === 'value') when.value = value
  else when[key] = Number(value)
  updateGroups(next)
}

function setWhenBoolean(groupIdx: number, branchIdx: number, value: boolean): void {
  const next = cloneGroups()
  const when = next[groupIdx]?.branches[branchIdx]?.when as Record<string, unknown> | undefined
  if (!when) return
  when.value = value
  updateGroups(next)
}
</script>

<template>
  <div class="a5">
    <div class="a5__header">
      <strong>{{ t('nodeStyle.a5Title') }}</strong>
      <button type="button" class="a5__btn" @click="addGroup">{{ t('nodeStyle.a5AddGroup') }}</button>
    </div>
    <div v-if="groups.length === 0" class="a5__empty">{{ t('nodeStyle.a5Empty') }}</div>

    <div v-for="(group, groupIdx) in groups" :key="groupIdx" class="a5__group">
      <div class="a5__group-head">
        <select :value="group.valueSource" @change="changeSource(groupIdx, ($event.target as HTMLSelectElement).value as 'component' | 'nodeType')">
          <option value="component">component</option>
          <option value="nodeType">nodeType</option>
        </select>
        <select :value="group.propertyName" @change="changeProperty(groupIdx, ($event.target as HTMLSelectElement).value)">
          <option
            v-for="prop in (group.valueSource === 'component' ? componentProperties : nodeTypeProperties)"
            :key="`${group.valueSource}-${prop.id}`"
            :value="prop.name"
          >
            {{ prop.name }} ({{ prop.type }})
          </option>
        </select>
        <button type="button" class="a5__btn a5__btn--danger a5__btn--sm" @click="removeGroup(groupIdx)">&times;</button>
      </div>

      <div class="a5__group-body">
        <div v-for="(branch, branchIdx) in group.branches" :key="`${groupIdx}-${branchIdx}`" class="a5__branch">
          <div class="a5__branch-when">
            <span class="a5__branch-when-label">when</span>
            <select :value="branch.when.op" @change="setWhenOperator(groupIdx, branchIdx, ($event.target as HTMLSelectElement).value as StyleBindingWhen['op'])">
              <option value="equals">equals</option>
              <option value="contains">contains</option>
              <option value="matchesRegex">regex</option>
              <option value="isEmpty">isEmpty</option>
              <option value="isNotEmpty">isNotEmpty</option>
              <option value="is">is</option>
              <option value="range">range</option>
              <option value="lt">&lt;</option>
              <option value="lte">&le;</option>
              <option value="gt">&gt;</option>
              <option value="gte">&ge;</option>
            </select>
            <input
              v-if="'value' in branch.when && branch.when.op !== 'is'"
              type="text"
              :value="String(branch.when.value ?? '')"
              @input="setWhenString(groupIdx, branchIdx, 'value', ($event.target as HTMLInputElement).value)"
            />
            <select
              v-if="branch.when.op === 'is'"
              :value="String(branch.when.value)"
              @change="setWhenBoolean(groupIdx, branchIdx, ($event.target as HTMLSelectElement).value === 'true')"
            >
              <option value="false">false</option>
              <option value="true">true</option>
            </select>
            <template v-if="branch.when.op === 'range'">
              <input
                type="number"
                :value="String(branch.when.min ?? '')"
                placeholder="min"
                @input="setWhenString(groupIdx, branchIdx, 'min', ($event.target as HTMLInputElement).value)"
              />
              <input
                type="number"
                :value="String(branch.when.max ?? '')"
                placeholder="max"
                @input="setWhenString(groupIdx, branchIdx, 'max', ($event.target as HTMLInputElement).value)"
              />
            </template>
            <button type="button" class="a5__btn a5__btn--danger a5__btn--sm" @click="removeBranch(groupIdx, branchIdx)">&times;</button>
          </div>

          <div v-for="(patch, patchIdx) in branch.patches" :key="`${groupIdx}-${branchIdx}-${patchIdx}`" class="a5__patch">
            <div class="a5__patch-head">
              <span class="a5__patch-target-label">target</span>
              <select v-model="patch.targetId">
                <option :value="outerTarget.id">outer</option>
                <option v-for="target in targetOptions" :key="target.id" :value="target.id">
                  {{ target.label }}
                </option>
              </select>
              <button type="button" class="a5__btn a5__btn--danger a5__btn--sm" @click="removePatch(groupIdx, branchIdx, patchIdx)">&times;</button>
            </div>
            <PatchPropertyEditor
              :patch="patch.patch"
              :target-id="patch.targetId"
              :tree-nodes="flatTreeNodes"
              @update:patch="setPatchObject(groupIdx, branchIdx, patchIdx, $event)"
            />
          </div>
          <div class="a5__patch-footer">
            <button type="button" class="a5__btn a5__btn--sm" @click="addPatch(groupIdx, branchIdx)">{{ t('nodeStyle.a5AddPatch') }}</button>
          </div>
        </div>
      </div>

      <div class="a5__group-footer">
        <button type="button" class="a5__btn a5__btn--sm" @click="addBranch(groupIdx)">{{ t('nodeStyle.a5AddBranch') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ── Root ──────────────────────────────────────────────────────── */
.a5 {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.a5__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.a5__header strong {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--base-text);
}

.a5__empty {
  font-size: 11px;
  color: var(--text-subtle);
  padding: 8px 0;
}

/* ── Group ─────────────────────────────────────────────────────── */
.a5__group {
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  overflow: hidden;
}

.a5__group-head {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  background: var(--surface-muted);
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}

.a5__group-body {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.a5__group-footer {
  padding: 4px 8px;
  border-top: 1px solid var(--border);
  background: var(--surface-muted);
}

/* ── Branch ────────────────────────────────────────────────────── */
.a5__branch {
  border-bottom: 1px solid var(--border);
  padding: 0;
}

.a5__branch:last-child {
  border-bottom: none;
}

.a5__branch-when {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  flex-wrap: wrap;
  border-left: 3px solid var(--primary);
  background: color-mix(in srgb, var(--primary) 3%, transparent);
}

.a5__branch-when-label {
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--primary);
  flex-shrink: 0;
  line-height: 1;
}

/* ── Patch ─────────────────────────────────────────────────────── */
.a5__patch {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 8px 6px 11px;
  border-left: 3px solid var(--border);
}

.a5__patch-head {
  display: flex;
  align-items: center;
  gap: 4px;
}

.a5__patch-target-label {
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-subtle);
  flex-shrink: 0;
}

.a5__patch-footer {
  padding: 4px 8px 4px 11px;
}

/* ── Shared controls ───────────────────────────────────────────── */
.a5 select,
.a5 input[type="text"],
.a5 input[type="number"] {
  height: 26px;
  padding: 0 6px;
  font-size: 11px;
  font-family: inherit;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--surface-muted);
  color: var(--base-text);
  outline: none;
  min-width: 0;
  box-sizing: border-box;
  transition: border-color 0.15s ease;
}

.a5 select:focus,
.a5 input:focus {
  border-color: var(--primary);
}

.a5 select {
  flex: 1;
  min-width: 60px;
  cursor: pointer;
}

.a5 input[type="text"],
.a5 input[type="number"] {
  flex: 1;
  min-width: 40px;
}

/* ── Buttons ───────────────────────────────────────────────────── */
.a5__btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  height: 24px;
  padding: 0 8px;
  border: 1px dashed var(--border);
  border-radius: 5px;
  background: var(--surface);
  color: var(--text-subtle);
  font-size: 10px;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
  transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease;
}

.a5__btn:hover {
  border-color: var(--primary);
  color: var(--primary);
  background: var(--primary-soft);
  border-style: solid;
}

.a5__btn--danger {
  color: var(--text-subtle);
  border-style: solid;
  padding: 0 5px;
  flex-shrink: 0;
}

.a5__btn--danger:hover {
  border-color: var(--danger);
  color: var(--danger);
  background: color-mix(in srgb, var(--danger) 6%, transparent);
}

.a5__btn--sm {
  height: 22px;
  padding: 0 6px;
  font-size: 10px;
}

</style>

