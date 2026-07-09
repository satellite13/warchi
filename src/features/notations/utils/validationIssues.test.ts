import { describe, it, expect } from 'vitest'
import type { ComposerTranslation } from 'vue-i18n'
import type { CustomProperty, DiagramStyle, CompositeSerializedCComponent } from '../notationAttrs'
import { customPropertyErrors, validateCompositeDiagramStyle } from './validationIssues'

const mockT = ((key: string, params?: Record<string, unknown>): string => {
  if (params) return `${key}(${JSON.stringify(params)})`
  return key
}) as unknown as ComposerTranslation

const makeProp = (overrides: Partial<CustomProperty> = {}): CustomProperty => ({
  id: 'p1',
  name: 'Prop Name',
  type: 'string',
  required: false,
  min: null,
  max: null,
  ...overrides,
})

describe('customPropertyErrors', () => {
  it('returns no errors for valid property', () => {
    const errors = customPropertyErrors(makeProp(), mockT)
    expect(errors).toEqual([])
  })

  it('flags empty name', () => {
    const errors = customPropertyErrors(makeProp({ name: '  ' }), mockT)
    expect(errors).toContain('types.validationNameRequired')
  })

  it('allows whitespace-only trimmed name to trigger error', () => {
    const errors = customPropertyErrors(makeProp({ name: '' }), mockT)
    expect(errors).toContain('types.validationNameRequired')
  })

  it('flags invalid regex', () => {
    const errors = customPropertyErrors(makeProp({ regex: '[invalid' }), mockT)
    expect(errors).toContain('types.validationRegexInvalid')
  })

  it('does not flag valid regex', () => {
    const errors = customPropertyErrors(makeProp({ regex: '^[A-Z]+$' }), mockT)
    expect(errors).not.toContain('types.validationRegexInvalid')
  })

  it('flags min > max for number type', () => {
    const errors = customPropertyErrors(makeProp({ type: 'number', min: 10, max: 5 }), mockT)
    expect(errors).toContain('types.validationMinGtMax')
  })

  it('does not flag min <= max', () => {
    const errors = customPropertyErrors(makeProp({ type: 'number', min: 0, max: 100 }), mockT)
    expect(errors).not.toContain('types.validationMinGtMax')
  })

  it('does not flag min check when min is null', () => {
    const errors = customPropertyErrors(makeProp({ type: 'number', min: null, max: 100 }), mockT)
    expect(errors).not.toContain('types.validationMinGtMax')
  })

  it('does not flag min check when max is null', () => {
    const errors = customPropertyErrors(makeProp({ type: 'number', min: 0, max: null }), mockT)
    expect(errors).not.toContain('types.validationMinGtMax')
  })

  it('flags empty enum values', () => {
    const errors = customPropertyErrors(makeProp({ type: 'enum', enumValues: [] }), mockT)
    expect(errors).toContain('types.validationEnumEmpty')
  })

  it('flags missing enum values', () => {
    const errors = customPropertyErrors(makeProp({ type: 'enum' }), mockT)
    expect(errors).toContain('types.validationEnumEmpty')
  })

  it('does not flag non-empty enum values', () => {
    const errors = customPropertyErrors(makeProp({ type: 'enum', enumValues: ['a', 'b'] }), mockT)
    expect(errors).not.toContain('types.validationEnumEmpty')
  })

  it('does not check enum for non-enum type', () => {
    const errors = customPropertyErrors(makeProp({ type: 'string' }), mockT)
    expect(errors).not.toContain('types.validationEnumEmpty')
  })

  it('flags required without default for string', () => {
    const errors = customPropertyErrors(makeProp({ type: 'string', required: true }), mockT)
    expect(errors).toContain('types.validationRequiredDefault')
  })

  it('does not flag required string with valid default', () => {
    const errors = customPropertyErrors(
      makeProp({ type: 'string', required: true, defaultValue: 'hello' }),
      mockT
    )
    expect(errors).not.toContain('types.validationRequiredDefault')
  })

  it('flags required string with empty default', () => {
    const errors = customPropertyErrors(
      makeProp({ type: 'string', required: true, defaultValue: '  ' }),
      mockT
    )
    expect(errors).toContain('types.validationRequiredDefault')
  })

  it('flags required without default for number', () => {
    const errors = customPropertyErrors(makeProp({ type: 'number', required: true }), mockT)
    expect(errors).toContain('types.validationRequiredDefault')
  })

  it('does not flag required number with valid default', () => {
    const errors = customPropertyErrors(
      makeProp({ type: 'number', required: true, defaultValue: 42 }),
      mockT
    )
    expect(errors).not.toContain('types.validationRequiredDefault')
  })

  it('flags required number with NaN default', () => {
    const errors = customPropertyErrors(
      makeProp({ type: 'number', required: true, defaultValue: NaN }),
      mockT
    )
    expect(errors).toContain('types.validationRequiredDefault')
  })

  it('flags required number with Infinity default', () => {
    const errors = customPropertyErrors(
      makeProp({ type: 'number', required: true, defaultValue: Infinity }),
      mockT
    )
    expect(errors).toContain('types.validationRequiredDefault')
  })

  it('flags required without default for boolean', () => {
    const errors = customPropertyErrors(makeProp({ type: 'boolean', required: true }), mockT)
    expect(errors).toContain('types.validationRequiredDefault')
  })

  it('does not flag required boolean with valid default', () => {
    const errors = customPropertyErrors(
      makeProp({ type: 'boolean', required: true, defaultValue: false }),
      mockT
    )
    expect(errors).not.toContain('types.validationRequiredDefault')
  })

  it('does not check required when not required', () => {
    const errors = customPropertyErrors(makeProp({ type: 'string', required: false }), mockT)
    expect(errors).not.toContain('types.validationRequiredDefault')
  })

  it('collects multiple errors at once for enum type', () => {
    const errors = customPropertyErrors(
      makeProp({
        name: '  ',
        type: 'enum',
        required: true,
        regex: '[bad',
        enumValues: [],
      }),
      mockT
    )
    expect(errors).toContain('types.validationNameRequired')
    expect(errors).toContain('types.validationRegexInvalid')
    expect(errors).toContain('types.validationEnumEmpty')
    expect(errors).toContain('types.validationRequiredDefault')
  })

  it('collects multiple errors at once for number type', () => {
    const errors = customPropertyErrors(
      makeProp({
        name: '',
        type: 'number',
        required: true,
        regex: '[bad',
        min: 10,
        max: 5,
      }),
      mockT
    )
    expect(errors).toContain('types.validationNameRequired')
    expect(errors).toContain('types.validationRegexInvalid')
    expect(errors).toContain('types.validationMinGtMax')
    expect(errors).toContain('types.validationRequiredDefault')
  })
})

describe('validateCompositeDiagramStyle - early returns', () => {
  it('returns empty for undefined style', () => {
    const issues = validateCompositeDiagramStyle(undefined, mockT)
    expect(issues).toEqual([])
  })

  it('returns empty when nodeShape is not composite', () => {
    const style: DiagramStyle = { nodeShape: 'rectangle' }
    const issues = validateCompositeDiagramStyle(style, mockT)
    expect(issues).toEqual([])
  })

  it('returns empty for empty style object', () => {
    const issues = validateCompositeDiagramStyle({}, mockT)
    expect(issues).toEqual([])
  })
})

describe('validateCompositeDiagramStyle - root validation', () => {
  it('flags missing compositeContent', () => {
    const style: DiagramStyle = { nodeShape: 'composite' }
    const issues = validateCompositeDiagramStyle(style, mockT)
    expect(issues).toHaveLength(1)
    expect(issues[0].code).toBe('COMPOSITE_ROOT_INVALID')
    expect(issues[0].severity).toBe('error')
  })

  it('flags compositeContent with wrong type', () => {
    const style: DiagramStyle = {
      nodeShape: 'composite',
      compositeContent: { type: 'text', id: 't' } as CompositeSerializedCComponent,
    }
    const issues = validateCompositeDiagramStyle(style, mockT)
    expect(issues).toHaveLength(1)
    expect(issues[0].code).toBe('COMPOSITE_ROOT_INVALID')
  })

  it('passes valid compositeContent', () => {
    const style: DiagramStyle = {
      nodeShape: 'composite',
      compositeContent: {
        type: 'container',
        children: [{ type: 'text', id: 'name', bindToProperty: '__name__', text: 'Label' }],
      } as CompositeSerializedCComponent,
    }
    const issues = validateCompositeDiagramStyle(style, mockT)
    const rootIssues = issues.filter(i => i.code === 'COMPOSITE_ROOT_INVALID')
    expect(rootIssues).toHaveLength(0)
  })
})

describe('validateCompositeDiagramStyle - name role', () => {
  it('warns when no name binding exists', () => {
    const style: DiagramStyle = {
      nodeShape: 'composite',
      compositeContent: {
        type: 'container',
        children: [{ type: 'text', id: 't1', text: 'Static' }],
      } as CompositeSerializedCComponent,
    }
    const issues = validateCompositeDiagramStyle(style, mockT)
    const nameIssue = issues.find(i => i.code === 'COMPOSITE_NAME_ROLE_MISSING')
    expect(nameIssue).toBeDefined()
    expect(nameIssue!.severity).toBe('warning')
  })

  it('warns when multiple name bindings exist', () => {
    const style: DiagramStyle = {
      nodeShape: 'composite',
      compositeContent: {
        type: 'container',
        children: [
          { type: 'text', id: 't1', bindToProperty: '__name__', text: '' },
          { type: 'text', id: 't2', bindToProperty: '__name__', text: '' },
        ],
      } as CompositeSerializedCComponent,
    }
    const issues = validateCompositeDiagramStyle(style, mockT)
    const dupIssue = issues.find(i => i.code === 'COMPOSITE_NAME_ROLE_DUPLICATE')
    expect(dupIssue).toBeDefined()
    expect(dupIssue!.severity).toBe('warning')
  })

  it('does not flag single name binding', () => {
    const style: DiagramStyle = {
      nodeShape: 'composite',
      compositeContent: {
        type: 'container',
        children: [{ type: 'text', id: 't1', bindToProperty: '__name__', text: '' }],
      } as CompositeSerializedCComponent,
    }
    const issues = validateCompositeDiagramStyle(style, mockT)
    const nameIssues = issues.filter(
      i => i.code === 'COMPOSITE_NAME_ROLE_MISSING' || i.code === 'COMPOSITE_NAME_ROLE_DUPLICATE'
    )
    expect(nameIssues).toHaveLength(0)
  })

  it('finds name binding in nested content', () => {
    const style: DiagramStyle = {
      nodeShape: 'composite',
      compositeContent: {
        type: 'container',
        children: [
          {
            type: 'container',
            content: { type: 'text', id: 'deep', bindToProperty: '__name__', text: '' },
          },
        ],
      } as CompositeSerializedCComponent,
    }
    const issues = validateCompositeDiagramStyle(style, mockT)
    const missing = issues.find(i => i.code === 'COMPOSITE_NAME_ROLE_MISSING')
    expect(missing).toBeUndefined()
  })

  it('counts multiple name bindings across nested structure', () => {
    const style: DiagramStyle = {
      nodeShape: 'composite',
      compositeContent: {
        type: 'container',
        children: [
          { type: 'text', id: 't1', bindToProperty: '__name__', text: '' },
          {
            type: 'container',
            children: [{ type: 'text', id: 't2', bindToProperty: '__name__', text: '' }],
          },
        ],
      } as CompositeSerializedCComponent,
    }
    const issues = validateCompositeDiagramStyle(style, mockT)
    expect(issues.find(i => i.code === 'COMPOSITE_NAME_ROLE_DUPLICATE')).toBeDefined()
  })
})

describe('validateCompositeDiagramStyle - icon binding', () => {
  it('passes single icon binding on icon element', () => {
    const style: DiagramStyle = {
      nodeShape: 'composite',
      compositeContent: {
        type: 'container',
        children: [
          { type: 'text', id: 'name', bindToProperty: '__name__', text: '' },
          { type: 'icon', id: 'icon', source: '/icons/x.svg', bindsNotationIcon: true },
        ],
      } as unknown as CompositeSerializedCComponent,
    }
    const issues = validateCompositeDiagramStyle(style, mockT)
    const iconIssues = issues.filter(
      i =>
        i.code === 'COMPOSITE_ICON_BIND_TARGET_INVALID' ||
        i.code === 'COMPOSITE_ICON_BIND_DUPLICATE'
    )
    expect(iconIssues).toHaveLength(0)
  })

  it('flags icon binding on non-icon element', () => {
    const style: DiagramStyle = {
      nodeShape: 'composite',
      compositeContent: {
        type: 'container',
        children: [
          { type: 'text', id: 'name', bindToProperty: '__name__', text: '' },
          {
            type: 'shape',
            id: 'bad',
            bindsNotationIcon: true,
          } as unknown as CompositeSerializedCComponent,
        ],
      } as CompositeSerializedCComponent,
    }
    const issues = validateCompositeDiagramStyle(style, mockT)
    const targetIssue = issues.find(i => i.code === 'COMPOSITE_ICON_BIND_TARGET_INVALID')
    expect(targetIssue).toBeDefined()
    expect(targetIssue!.severity).toBe('error')
    expect(targetIssue!.path).toBe('compositeContent.children[1]')
  })

  it('flags duplicate icon bindings', () => {
    const style: DiagramStyle = {
      nodeShape: 'composite',
      compositeContent: {
        type: 'container',
        children: [
          { type: 'text', id: 'name', bindToProperty: '__name__', text: '' },
          { type: 'icon', id: 'i1', source: '/icons/a.svg', bindsNotationIcon: true },
          { type: 'icon', id: 'i2', source: '/icons/b.svg', bindsNotationIcon: true },
        ],
      } as unknown as CompositeSerializedCComponent,
    }
    const issues = validateCompositeDiagramStyle(style, mockT)
    const dupIssue = issues.find(i => i.code === 'COMPOSITE_ICON_BIND_DUPLICATE')
    expect(dupIssue).toBeDefined()
    expect(dupIssue!.severity).toBe('error')
  })

  it('detects icon binding in nested children', () => {
    const style: DiagramStyle = {
      nodeShape: 'composite',
      compositeContent: {
        type: 'container',
        children: [
          { type: 'text', id: 'name', bindToProperty: '__name__', text: '' },
          {
            type: 'container',
            children: [{ type: 'shape', id: 'nested', bindsNotationIcon: true }],
          },
        ],
      } as unknown as CompositeSerializedCComponent,
    }
    const issues = validateCompositeDiagramStyle(style, mockT)
    const targetIssue = issues.find(i => i.code === 'COMPOSITE_ICON_BIND_TARGET_INVALID')
    expect(targetIssue).toBeDefined()
  })
})

describe('validateCompositeDiagramStyle - stylePropertyBindings target validation', () => {
  it('flags target ID not found in composite tree', () => {
    const style: DiagramStyle = {
      nodeShape: 'composite',
      compositeContent: {
        type: 'container',
        children: [
          { type: 'text', id: 'name', bindToProperty: '__name__', text: '' },
          { type: 'shape', id: 'realShape', bg: '#fff' },
        ],
      } as CompositeSerializedCComponent,
      stylePropertyBindings: [
        {
          valueSource: 'component',
          propertyName: 'status',
          branches: [
            {
              when: { op: 'equals', value: 'new' },
              patches: [{ targetId: 'missingTarget', patch: { bg: '#f00' } }],
            },
          ],
        },
      ],
    }
    const issues = validateCompositeDiagramStyle(style, mockT)
    const a5Issue = issues.find(i => i.code === 'A5_TARGET_NOT_FOUND')
    expect(a5Issue).toBeDefined()
    expect(a5Issue!.severity).toBe('error')
    expect(a5Issue!.message).toContain('missingTarget')
  })

  it('does not flag __compositeOuter__ target', () => {
    const style: DiagramStyle = {
      nodeShape: 'composite',
      compositeContent: {
        type: 'container',
        children: [{ type: 'text', id: 'name', bindToProperty: '__name__', text: '' }],
      } as CompositeSerializedCComponent,
      stylePropertyBindings: [
        {
          valueSource: 'component',
          propertyName: 'mode',
          branches: [
            {
              when: { op: 'equals', value: 'dark' },
              patches: [{ targetId: '__compositeOuter__', patch: { opacity: 0.5 } }],
            },
          ],
        },
      ],
    }
    const issues = validateCompositeDiagramStyle(style, mockT)
    const a5Issues = issues.filter(i => i.code === 'A5_TARGET_NOT_FOUND')
    expect(a5Issues).toHaveLength(0)
  })

  it('does not flag valid target that exists', () => {
    const style: DiagramStyle = {
      nodeShape: 'composite',
      compositeContent: {
        type: 'container',
        children: [
          { type: 'text', id: 'name', bindToProperty: '__name__', text: '' },
          { type: 'shape', id: 'targetShape', bg: '#fff' },
        ],
      } as CompositeSerializedCComponent,
      stylePropertyBindings: [
        {
          valueSource: 'component',
          propertyName: 'status',
          branches: [
            {
              when: { op: 'equals', value: 'new' },
              patches: [{ targetId: 'targetShape', patch: { bg: '#f00' } }],
            },
          ],
        },
      ],
    }
    const issues = validateCompositeDiagramStyle(style, mockT)
    const a5Issues = issues.filter(i => i.code === 'A5_TARGET_NOT_FOUND')
    expect(a5Issues).toHaveLength(0)
  })

  it('finds target in nested children', () => {
    const style: DiagramStyle = {
      nodeShape: 'composite',
      compositeContent: {
        type: 'container',
        children: [
          { type: 'text', id: 'name', bindToProperty: '__name__', text: '' },
          {
            type: 'container',
            children: [{ type: 'shape', id: 'nestedTarget', bg: '#fff' }],
          },
        ],
      } as CompositeSerializedCComponent,
      stylePropertyBindings: [
        {
          valueSource: 'component',
          propertyName: 'x',
          branches: [
            {
              when: { op: 'equals', value: 'a' },
              patches: [{ targetId: 'nestedTarget', patch: { bg: '#f00' } }],
            },
          ],
        },
      ],
    }
    const issues = validateCompositeDiagramStyle(style, mockT)
    expect(issues.filter(i => i.code === 'A5_TARGET_NOT_FOUND')).toHaveLength(0)
  })

  it('finds target in nested content', () => {
    const style: DiagramStyle = {
      nodeShape: 'composite',
      compositeContent: {
        type: 'container',
        children: [
          { type: 'text', id: 'name', bindToProperty: '__name__', text: '' },
          {
            type: 'container',
            content: { type: 'shape', id: 'deepTarget', bg: '#fff' },
          },
        ],
      } as CompositeSerializedCComponent,
      stylePropertyBindings: [
        {
          valueSource: 'component',
          propertyName: 'x',
          branches: [
            {
              when: { op: 'equals', value: 'a' },
              patches: [{ targetId: 'deepTarget', patch: { bg: '#f00' } }],
            },
          ],
        },
      ],
    }
    const issues = validateCompositeDiagramStyle(style, mockT)
    expect(issues.filter(i => i.code === 'A5_TARGET_NOT_FOUND')).toHaveLength(0)
  })

  it('reports multiple missing targets across branches', () => {
    const style: DiagramStyle = {
      nodeShape: 'composite',
      compositeContent: {
        type: 'container',
        children: [{ type: 'text', id: 'name', bindToProperty: '__name__', text: '' }],
      } as CompositeSerializedCComponent,
      stylePropertyBindings: [
        {
          valueSource: 'component',
          propertyName: 'status',
          branches: [
            {
              when: { op: 'equals', value: 'new' },
              patches: [{ targetId: 'missing1', patch: { bg: '#f00' } }],
            },
            {
              when: { op: 'equals', value: 'old' },
              patches: [{ targetId: 'missing2', patch: { bg: '#00f' } }],
            },
          ],
        },
      ],
    }
    const issues = validateCompositeDiagramStyle(style, mockT)
    const a5Issues = issues.filter(i => i.code === 'A5_TARGET_NOT_FOUND')
    expect(a5Issues).toHaveLength(2)
  })

  it('reports targets across multiple binding groups', () => {
    const style: DiagramStyle = {
      nodeShape: 'composite',
      compositeContent: {
        type: 'container',
        children: [{ type: 'text', id: 'name', bindToProperty: '__name__', text: '' }],
      } as CompositeSerializedCComponent,
      stylePropertyBindings: [
        {
          valueSource: 'component',
          propertyName: 'a',
          branches: [
            {
              when: { op: 'equals', value: '1' },
              patches: [{ targetId: 'missA', patch: { bg: '#f00' } }],
            },
          ],
        },
        {
          valueSource: 'nodeType',
          propertyName: 'b',
          branches: [
            {
              when: { op: 'equals', value: '2' },
              patches: [{ targetId: 'missB', patch: { bg: '#00f' } }],
            },
          ],
        },
      ],
    }
    const issues = validateCompositeDiagramStyle(style, mockT)
    const a5Issues = issues.filter(i => i.code === 'A5_TARGET_NOT_FOUND')
    expect(a5Issues).toHaveLength(2)
  })

  it('path includes valueSource and propertyName for A5_TARGET_NOT_FOUND', () => {
    const style: DiagramStyle = {
      nodeShape: 'composite',
      compositeContent: {
        type: 'container',
        children: [{ type: 'text', id: 'name', bindToProperty: '__name__', text: '' }],
      } as CompositeSerializedCComponent,
      stylePropertyBindings: [
        {
          valueSource: 'nodeType',
          propertyName: 'category',
          branches: [
            {
              when: { op: 'equals', value: 'x' },
              patches: [{ targetId: 'gone', patch: { bg: '#f00' } }],
            },
          ],
        },
      ],
    }
    const issues = validateCompositeDiagramStyle(style, mockT)
    const a5Issue = issues.find(i => i.code === 'A5_TARGET_NOT_FOUND')
    expect(a5Issue!.path).toBe('diagramStyle.stylePropertyBindings.nodeType.category')
  })

  it('skips validation when stylePropertyBindings is empty array', () => {
    const style: DiagramStyle = {
      nodeShape: 'composite',
      compositeContent: {
        type: 'container',
        children: [{ type: 'text', id: 'name', bindToProperty: '__name__', text: '' }],
      } as CompositeSerializedCComponent,
      stylePropertyBindings: [],
    }
    const issues = validateCompositeDiagramStyle(style, mockT)
    expect(issues.filter(i => i.code === 'A5_TARGET_NOT_FOUND')).toHaveLength(0)
  })
})

describe('validateCompositeDiagramStyle - combined issues', () => {
  it('returns all applicable issues at once', () => {
    const style: DiagramStyle = {
      nodeShape: 'composite',
      compositeContent: {
        type: 'container',
        children: [
          {
            type: 'shape',
            id: 's1',
            bindsNotationIcon: true,
          } as unknown as CompositeSerializedCComponent,
          { type: 'icon', id: 'i1', source: '/icons/a.svg', bindsNotationIcon: true },
          { type: 'icon', id: 'i2', source: '/icons/b.svg', bindsNotationIcon: true },
        ],
      } as CompositeSerializedCComponent,
      stylePropertyBindings: [
        {
          valueSource: 'component',
          propertyName: 'x',
          branches: [
            {
              when: { op: 'equals', value: 'a' },
              patches: [{ targetId: 'missingTarget', patch: { bg: '#f' } }],
            },
          ],
        },
      ],
    }
    const issues = validateCompositeDiagramStyle(style, mockT)

    expect(issues.find(i => i.code === 'COMPOSITE_NAME_ROLE_MISSING')).toBeDefined()
    expect(issues.find(i => i.code === 'COMPOSITE_ICON_BIND_TARGET_INVALID')).toBeDefined()
    expect(issues.find(i => i.code === 'COMPOSITE_ICON_BIND_DUPLICATE')).toBeDefined()
    expect(issues.find(i => i.code === 'A5_TARGET_NOT_FOUND')).toBeDefined()
  })
})
