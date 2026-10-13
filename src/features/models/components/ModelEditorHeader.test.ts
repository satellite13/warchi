import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ModelEditorHeader from './ModelEditorHeader.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k, te: () => false, locale: { value: 'ru' } }),
}))
vi.mock('@/composables/useAuth', () => ({ useAuth: () => ({ currentUser: { value: null } }) }))
const grantState = vi.hoisted(() => ({ grants: null as Set<string> | null }))
vi.mock('@/composables/useFeatureGrants', () => ({
  useFeatureGrants: () => ({
    hasGrant: (key: string) => (grantState.grants ? grantState.grants.has(key) : true),
  }),
}))
vi.mock('@/composables/useFavorites', () => ({
  useFavorites: () => ({ isFavorite: () => false, toggleFavorite: vi.fn() }),
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

describe('ModelEditorHeader view menu', () => {
  it('emits show-diagram-in-tree action from view menu', async () => {
    const wrapper = mount(ModelEditorHeader, {
      props: { hasActiveDiagram: true, diagramVersions: [], selectedDiagramId: 'd1' },
      global: {
        stubs: {
          UiIcon: { template: '<i />', props: ['name'] },
          AppTooltip: { template: '<span><slot /></span>' },
        },
      },
    })
    // Dropdown рендерит общий IconToolbar: кнопка меню — по title (t замокан => это ключ i18n),
    // пункты меню — .icon-toolbar__menu-item внутри .icon-toolbar__menu.
    const viewBtn = wrapper
      .findAll('button.icon-toolbar__btn--dd')
      .find(b => b.attributes('title') === 'toolbar.viewMenu')
    await viewBtn!.trigger('click')
    const item = wrapper
      .findAll('.icon-toolbar__menu-item')
      .find(w => w.text().includes('toolbar.showDiagramInTree'))
    await item!.trigger('click')
    expect(wrapper.emitted('action')).toEqual([['show-diagram-in-tree']])
  })

  it('renders flat zoom in/out buttons and a 4-item more_vert view menu', async () => {
    const wrapper = mount(ModelEditorHeader, {
      props: { hasActiveDiagram: true, diagramVersions: [], selectedDiagramId: 'd1' },
      global: {
        stubs: {
          // Стаб с data-icon: плоские кнопки зума ищем по иконке.
          UiIcon: { template: '<i :data-icon="name" />', props: ['name'] },
          AppTooltip: { template: '<span><slot /></span>' },
        },
      },
    })
    // Плоские кнопки зума: zoom_in и zoom_out — отдельно, не пункты меню.
    const flatIcons = wrapper
      .findAll('button.icon-toolbar__btn:not(.icon-toolbar__btn--dd) [data-icon]')
      .map(b => b.attributes('data-icon'))
    expect(flatIcons).toContain('zoom_in')
    expect(flatIcons).toContain('zoom_out')
    // Кнопка меню вида — more_vert (проверяем по кнопке с title).
    const viewBtn = wrapper
      .findAll('button.icon-toolbar__btn--dd')
      .find(b => b.attributes('title') === 'toolbar.viewMenu')
    expect(viewBtn).toBeTruthy()
    expect(viewBtn!.html()).toContain('data-icon="more_vert"')
    await viewBtn!.trigger('click')
    const labels = wrapper.findAll('.icon-toolbar__menu-item').map(n => n.text())
    expect(labels).toHaveLength(4)
    expect(labels.join('|')).toContain('fitScreen')
    expect(labels.join('|')).toContain('zoomSelection')
    expect(labels.join('|')).toContain('resetZoom')
    expect(labels.join('|')).toContain('showDiagramInTree')
  })

  it('emits zoom-in/zoom-out from the flat buttons', async () => {
    const wrapper = mount(ModelEditorHeader, {
      props: { hasActiveDiagram: true, diagramVersions: [], selectedDiagramId: 'd1' },
      global: {
        stubs: {
          UiIcon: { template: '<i :data-icon="name" />', props: ['name'] },
          AppTooltip: { template: '<span><slot /></span>' },
        },
      },
    })
    const zoomIn = wrapper
      .findAll('button.icon-toolbar__btn')
      .find(b => b.find('[data-icon="zoom_in"]').exists())
    const zoomOut = wrapper
      .findAll('button.icon-toolbar__btn')
      .find(b => b.find('[data-icon="zoom_out"]').exists())
    expect(zoomIn).toBeTruthy()
    expect(zoomOut).toBeTruthy()
    await zoomIn!.trigger('click')
    await zoomOut!.trigger('click')
    expect(wrapper.emitted('action')).toContainEqual(['zoom-in'])
    expect(wrapper.emitted('action')).toContainEqual(['zoom-out'])
  })
})

describe('ModelEditorHeader notation upgrade chip', () => {
  const mountHeader = (props: Record<string, unknown>) =>
    mount(ModelEditorHeader, {
      props: { hasActiveDiagram: true, diagramVersions: [], selectedDiagramId: 'd1', ...props },
      global: {
        stubs: {
          UiIcon: { template: '<i />', props: ['name'] },
          AppTooltip: { template: '<span><slot /></span>' },
        },
      },
    })

  it('shows upgrade chip with newer version and emits migrateNotation on click', async () => {
    const wrapper = mountHeader({
      notationName: 'ArchiMate',
      notationVersion: '3.1.0',
      newerNotationVersion: '3.2.0',
    })
    const chip = wrapper.find('.model-header__notation-upgrade')
    expect(chip.exists()).toBe(true)
    expect(chip.text()).toContain('3.2.0')
    expect(chip.text()).not.toContain('3.1.0')
    await chip.trigger('click')
    expect(wrapper.emitted('migrateNotation')).toEqual([[]])
  })

  it('hides upgrade chip without newerNotationVersion prop', () => {
    const wrapper = mountHeader({ notationName: 'ArchiMate', notationVersion: '3.1.0' })
    expect(wrapper.find('.model-header__notation-upgrade').exists()).toBe(false)
  })

  it('hides upgrade chip when notation name is absent', () => {
    const wrapper = mountHeader({ notationVersion: '3.1.0', newerNotationVersion: '3.2.0' })
    expect(wrapper.find('.model-header__notation-upgrade').exists()).toBe(false)
  })
})

describe('ModelEditorHeader export menu', () => {
  const mountHeader = (props: Record<string, unknown>) =>
    mount(ModelEditorHeader, {
      props: { hasActiveDiagram: false, diagramVersions: [], selectedDiagramId: null, ...props },
      global: {
        stubs: {
          // Как в src/test/setup.ts, но имя иконки — только в data-icon (не текстом,
          // чтобы .text() пунктов меню содержал только лейбл).
          UiIcon: { template: '<i class="ui-icon" :data-icon="name" />', props: ['name', 'alt'] },
          AppTooltip: { template: '<span><slot /></span>' },
        },
      },
    })

  afterEach(() => {
    grantState.grants = null
  })

  const exportMenuBtn = (wrapper: ReturnType<typeof mount>) =>
    wrapper
      .findAll('button.icon-toolbar__btn--dd')
      .find(b => b.attributes('title') === 'toolbar.exportMenu')

  it('stays clickable without an active diagram when OEF import is available', () => {
    grantState.grants = new Set(['model.importOef'])
    const wrapper = mountHeader({ canEditModel: true })
    const btn = exportMenuBtn(wrapper)!
    expect(btn).toBeTruthy()
    expect(btn.attributes('disabled')).toBeUndefined()
  })

  it('stays clickable without an active diagram when model export is available', () => {
    grantState.grants = new Set(['model.export'])
    const wrapper = mountHeader({})
    expect(exportMenuBtn(wrapper)!.attributes('disabled')).toBeUndefined()
  })

  it('renders no export menu without any of its grants', () => {
    grantState.grants = new Set<string>()
    const wrapper = mountHeader({})
    expect(exportMenuBtn(wrapper)).toBeUndefined()
  })

  it('is disabled without an active diagram and without diagram-independent grants', () => {
    grantState.grants = new Set(['model.exportDiagramImage'])
    const wrapper = mountHeader({ canEditModel: false })
    expect(exportMenuBtn(wrapper)!.attributes('disabled')).toBeDefined()
  })

  it('renders ios_share icon with exactly 5 items in mockup order', () => {
    grantState.grants = new Set(['model.exportDiagramImage', 'model.importOef', 'model.export'])
    const wrapper = mountHeader({ canEditModel: true })
    const btn = exportMenuBtn(wrapper)!
    expect(btn).toBeTruthy()
    // UiIcon глобально стабится в src/test/setup.ts как <i data-icon="name">{{ name }}</i>.
    expect(btn.html()).toContain('ios_share')
    expect(btn.html()).not.toContain('>file_download<')
    // Открываем меню и проверяем порядок пунктов.
    const ddBtn = wrapper
      .findAll('button.icon-toolbar__btn--dd')
      .find(b => b.attributes('title') === 'toolbar.exportMenu')!
    return ddBtn.trigger('click').then(async () => {
      const items = wrapper.findAll('.icon-toolbar__menu-item')
      const labels = items.map(n => n.text())
      expect(labels).toEqual([
        'toolbar.exportDiagramPng',
        'toolbar.exportDiagramSvg',
        'toolbar.shareDiagramImage',
        'toolbar.exportModelPackage',
        'models.oefImportTitle',
      ])
      // Иконки пунктов — по утверждённым решениям DGTW-4060 (план, «Утверждённые решения»).
      const itemIcons = items.map(n => n.find('[data-icon]').attributes('data-icon'))
      expect(itemIcons).toEqual(['image', 'code', 'add_photo_alternate', 'download', 'upload'])
    })
  })
})

describe('ModelEditorHeader flat admin tools', () => {
  const mountHeader = (props: Record<string, unknown>) =>
    mount(ModelEditorHeader, {
      props: { hasActiveDiagram: true, diagramVersions: [], selectedDiagramId: 'd1', ...props },
      global: {
        stubs: {
          UiIcon: { template: '<i class="ui-icon" :data-icon="name" />', props: ['name', 'alt'] },
          AppTooltip: { template: '<span><slot /></span>' },
        },
      },
    })

  afterEach(() => {
    grantState.grants = null
  })

  const flatBtns = (wrapper: ReturnType<typeof mount>) =>
    wrapper.findAll('button.icon-toolbar__btn:not(.icon-toolbar__btn--dd)')

  it('renders terminal/data_object/article as flat buttons for admin with grants', () => {
    grantState.grants = new Set(['model.runValidationScripts', 'model.inspectJson'])
    const wrapper = mountHeader({ isAdmin: true, showDiagramWikiButton: true })
    const icons = flatBtns(wrapper).map(b => b.find('[data-icon]').attributes('data-icon'))
    expect(icons).toContain('terminal')
    expect(icons).toContain('data_object')
    expect(icons).toContain('article')
    // Сервисное меню больше не существует.
    expect(
      wrapper
        .findAll('button.icon-toolbar__btn--dd')
        .find(b => b.attributes('title') === 'toolbar.serviceMenu')
    ).toBeUndefined()
  })

  it('keeps save as the last toolbar button and drops close-diagram', () => {
    grantState.grants = new Set(['model.runValidationScripts', 'model.inspectJson'])
    const wrapper = mountHeader({ isAdmin: true, showDiagramWikiButton: true })
    const icons = flatBtns(wrapper)
      .map(b => b.find('[data-icon]').attributes('data-icon'))
      .filter(i => i !== 'pan_tool' && i !== 'undo' && i !== 'redo')
    expect(icons[icons.length - 1]).toBe('save')
    expect(icons).not.toContain('close')
    // Кнопки-сепараторы не считаем: pan_tool идёт первым в тулбаре.
  })

  it('hides admin tools without grants and for non-admin', () => {
    // non-admin (editor) с грантом терминал не видит: вся группа за canUseAdvancedTools
    // (так было и в сервисном меню — семантика сохранена).
    grantState.grants = new Set(['model.runValidationScripts'])
    const noAdmin = mountHeader({ isAdmin: false, showDiagramWikiButton: true })
    let icons = flatBtns(noAdmin).map(b => b.find('[data-icon]').attributes('data-icon'))
    expect(icons).not.toContain('data_object')
    expect(icons).not.toContain('terminal')

    grantState.grants = new Set<string>()
    const noGrants = mountHeader({ isAdmin: true, showDiagramWikiButton: true })
    icons = flatBtns(noGrants).map(b => b.find('[data-icon]').attributes('data-icon'))
    expect(icons).not.toContain('terminal')
    expect(icons).not.toContain('data_object')
  })
})

describe('ModelEditorHeader right header duplicates', () => {
  const mountHeader = (props: Record<string, unknown>) =>
    mount(ModelEditorHeader, {
      props: {
        hasActiveDiagram: true,
        diagramName: 'Diagram',
        diagramVersion: '1.0',
        diagramVersions: [
          {
            id: 'd1',
            version: '1.0',
            ownerId: 'u1',
            createdAt: '2026-01-01',
            updatedAt: '2026-01-02',
          },
        ],
        selectedDiagramId: 'd1',
        ...props,
      },
      global: {
        stubs: {
          UiIcon: { template: '<i class="ui-icon" :data-icon="name" />', props: ['name', 'alt'] },
          AppTooltip: { template: '<span><slot /></span>' },
        },
      },
    })

  afterEach(() => {
    grantState.grants = null
  })

  const versionTrigger = (wrapper: ReturnType<typeof mount>) =>
    wrapper.find('.version-switch__trigger')

  it('drops the standalone compare button from #left-extra', () => {
    const wrapper = mountHeader({ showCompareButton: true })
    expect(wrapper.find('.deh-icon-btn [data-icon="compare_arrows"]').exists()).toBe(false)
  })

  it('drops the favorite star from the version trigger (favorites live in the tree)', () => {
    const wrapper = mountHeader({})
    expect(versionTrigger(wrapper).find('.version-switch__fav').exists()).toBe(false)
    // Метка версии и каретка остаются.
    expect(versionTrigger(wrapper).find('.version-switch__label').exists()).toBe(true)
    expect(versionTrigger(wrapper).find('[data-icon="arrow_drop_down"]').exists()).toBe(true)
  })

  it('marks the active version with a check icon, not only color', async () => {
    grantState.grants = new Set<string>()
    const wrapper = mountHeader({
      diagramVersions: [
        {
          id: 'd1',
          version: '1.0',
          ownerId: 'u1',
          createdAt: '2026-01-01',
          updatedAt: '2026-01-02',
        },
        {
          id: 'd2',
          version: '0.9',
          ownerId: 'u1',
          createdAt: '2026-01-01',
          updatedAt: '2026-01-02',
        },
      ],
      selectedDiagramId: 'd1',
    })
    await versionTrigger(wrapper).trigger('click')
    const items = wrapper.findAll('.version-switch__item')
    const active = items.find(i => i.classes().includes('version-switch__item--active'))
    expect(active).toBeTruthy()
    expect(active!.text()).toContain('1.0')
    expect(active!.find('[data-icon="check"]').exists()).toBe(true)
    const inactive = items.find(i => i.text().includes('0.9'))
    expect(inactive!.find('[data-icon="check"]').exists()).toBe(false)
  })

  it('keeps actions reachable without scrolling: version list scrolls, actions stay pinned', async () => {
    grantState.grants = new Set(['model.compareVersions', 'model.createBaseline'])
    const manyVersions = Array.from({ length: 12 }, (_, i) => ({
      id: `d${i}`,
      version: `1.${11 - i}`,
      ownerId: 'u1',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-02',
    }))
    const wrapper = mountHeader({
      diagramVersions: manyVersions,
      selectedDiagramId: 'd0',
      modelId: 'm1',
      isDiagramReadOnly: false,
    })
    await versionTrigger(wrapper).trigger('click')
    const menu = wrapper.find('.version-switch__menu')
    expect(menu.exists()).toBe(true)
    // Скроллящийся список версий — отдельный контейнер с классом version-switch__list
    // (overflow-y задаётся в scoped-стилях компонента).
    const list = wrapper.find('.version-switch__list')
    expect(list.exists()).toBe(true)
    // Действия вне скролл-контейнера (сверху/снизу меню, но не внутри списка).
    const compareBtn = menu.findAll('button').find(b => b.text().includes('compareDiagramVersions'))
    const baselineBtn = menu.findAll('button').find(b => b.text().includes('createBaseline'))
    expect(compareBtn).toBeTruthy()
    expect(baselineBtn).toBeTruthy()
    expect(compareBtn!.element.closest('.version-switch__list')).toBeNull()
    expect(baselineBtn!.element.closest('.version-switch__list')).toBeNull()
  })

  it('keeps grant-gated header buttons untouched', () => {
    grantState.grants = new Set([
      'model.relationMatrix',
      'model.validationReport',
      'model.shareAccess',
    ])
    const wrapper = mountHeader({ modelId: 'm1', canShare: true, showModelWikiButton: true })
    const icons = wrapper.findAll('.deh-icon-btn [data-icon]').map(b => b.attributes('data-icon'))
    expect(icons).toContain('grid_view')
    expect(icons).toContain('fact_check')
    expect(icons).toContain('share')
    expect(icons).toContain('article')
  })

  it('version menu still holds compare action and baseline creation', async () => {
    grantState.grants = new Set(['model.compareVersions', 'model.createBaseline'])
    const wrapper = mountHeader({ modelId: 'm1', isDiagramReadOnly: false })
    await versionTrigger(wrapper).trigger('click')
    const menu = wrapper.find('.version-switch__menu')
    expect(menu.exists()).toBe(true)
    expect(menu.text()).toContain('compareDiagramVersions')
    expect(menu.text()).toContain('createBaseline')
  })
})

describe('ModelEditorHeader validation report button', () => {
  const mountHeader = (props: Record<string, unknown>) =>
    mount(ModelEditorHeader, {
      props: { hasActiveDiagram: true, diagramVersions: [], selectedDiagramId: 'd1', ...props },
      global: {
        stubs: {
          // Рендерим имя иконки в data-атрибут: стаб по умолчанию (<i />) его не отдаёт.
          UiIcon: { template: '<i :data-icon="name" />', props: ['name'] },
          AppTooltip: { template: '<span><slot /></span>' },
        },
      },
    })

  afterEach(() => {
    grantState.grants = null
  })

  const validationBtn = (wrapper: ReturnType<typeof mount>) =>
    wrapper.findAll('button.deh-icon-btn').find(b => b.html().includes('fact_check'))

  it('renders validation report button with model.validationReport grant', async () => {
    grantState.grants = new Set(['model.validationReport'])
    const wrapper = mountHeader({ modelId: 'm1' })
    const btn = validationBtn(wrapper)
    expect(btn).toBeTruthy()
    await btn!.trigger('click')
    expect(wrapper.emitted('openValidation')).toEqual([[]])
  })

  it('hides validation report button without the grant', () => {
    grantState.grants = new Set<string>()
    const wrapper = mountHeader({ modelId: 'm1' })
    expect(validationBtn(wrapper)).toBeUndefined()
  })

  it('hides validation report button without modelId even with grant', () => {
    grantState.grants = new Set(['model.validationReport'])
    const wrapper = mountHeader({ modelId: null })
    expect(validationBtn(wrapper)).toBeUndefined()
  })
})
