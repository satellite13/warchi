<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type {
  CustomProperty,
  StylePropertyBindingGroup,
  StyleBindingWhen,
} from '../../notationAttrs'

const props = defineProps<{
  modelValue: StylePropertyBindingGroup[]
  componentProperties: CustomProperty[]
  nodeTypeProperties: CustomProperty[]
  targetOptions: Array<{ id: string; label: string }>
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
  value: string
): void {
  const next = cloneGroups()
  const patch = next[groupIdx]?.branches[branchIdx]?.patches[patchIdx]
  if (!patch) return
  try {
    patch.patch = value.trim().length ? (JSON.parse(value) as Record<string, unknown>) : {}
    updateGroups(next)
  } catch {
    // Keep invalid json in textarea until blur parse succeeds.
  }
}

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
      <div class="a5__row">
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
        <button type="button" class="a5__btn a5__btn--danger" @click="removeGroup(groupIdx)">{{ t('nodeStyle.a5RemoveGroup') }}</button>
      </div>

      <div v-for="(branch, branchIdx) in group.branches" :key="`${groupIdx}-${branchIdx}`" class="a5__branch">
        <div class="a5__row">
          <select :value="branch.when.op" @change="setWhenOperator(groupIdx, branchIdx, ($event.target as HTMLSelectElement).value as StyleBindingWhen['op'])">
            <option value="equals">equals</option>
            <option value="contains">contains</option>
            <option value="matchesRegex">matchesRegex</option>
            <option value="isEmpty">isEmpty</option>
            <option value="isNotEmpty">isNotEmpty</option>
            <option value="is">is</option>
            <option value="range">range</option>
            <option value="lt">lt</option>
            <option value="lte">lte</option>
            <option value="gt">gt</option>
            <option value="gte">gte</option>
          </select>

          <input
            v-if="'value' in branch.when && branch.when.op !== 'is'"
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
              :value="String(branch.when.min ?? '')"
              placeholder="min"
              @input="setWhenString(groupIdx, branchIdx, 'min', ($event.target as HTMLInputElement).value)"
            />
            <input
              :value="String(branch.when.max ?? '')"
              placeholder="max"
              @input="setWhenString(groupIdx, branchIdx, 'max', ($event.target as HTMLInputElement).value)"
            />
          </template>
          <button type="button" class="a5__btn a5__btn--danger" @click="removeBranch(groupIdx, branchIdx)">{{ t('nodeStyle.a5RemoveBranch') }}</button>
        </div>

        <div v-for="(patch, patchIdx) in branch.patches" :key="`${groupIdx}-${branchIdx}-${patchIdx}`" class="a5__patch">
          <div class="a5__row">
            <select v-model="patch.targetId">
              <option :value="outerTarget.id">{{ outerTarget.label }}</option>
              <option v-for="target in targetOptions" :key="target.id" :value="target.id">
                {{ target.label }}
              </option>
            </select>
            <button type="button" class="a5__btn a5__btn--danger" @click="removePatch(groupIdx, branchIdx, patchIdx)">{{ t('nodeStyle.a5RemovePatch') }}</button>
          </div>
          <textarea
            :value="JSON.stringify(patch.patch, null, 2)"
            rows="4"
            @blur="setPatchObject(groupIdx, branchIdx, patchIdx, ($event.target as HTMLTextAreaElement).value)"
          />
        </div>
        <button type="button" class="a5__btn" @click="addPatch(groupIdx, branchIdx)">{{ t('nodeStyle.a5AddPatch') }}</button>
      </div>
      <button type="button" class="a5__btn" @click="addBranch(groupIdx)">{{ t('nodeStyle.a5AddBranch') }}</button>
    </div>
  </div>
</template>

<style scoped>
.a5 { display: flex; flex-direction: column; gap: 8px; }
.a5__header { display: flex; justify-content: space-between; align-items: center; }
.a5__group, .a5__branch, .a5__patch { border: 1px solid var(--border); border-radius: 8px; padding: 8px; }
.a5__row { display: flex; gap: 8px; align-items: center; margin-bottom: 6px; flex-wrap: wrap; }
.a5__btn { border: 1px solid var(--border); background: var(--surface); border-radius: 6px; padding: 4px 8px; cursor: pointer; }
.a5__btn--danger { color: var(--danger); }
.a5 textarea { width: 100%; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
.a5 select, .a5 input { min-height: 30px; border: 1px solid var(--border); border-radius: 6px; padding: 0 8px; }
.a5__empty { color: var(--text-muted); }
</style>

