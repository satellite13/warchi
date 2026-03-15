import { config } from '@vue/test-utils'

// Stub global UiIcon component (renders as <img> with icon name as alt)
config.global.stubs = {
  UiIcon: {
    template: '<i class="ui-icon" :data-icon="name">{{ name }}</i>',
    props: ['name', 'alt'],
  },
}

// Provide minimal i18n mock
config.global.mocks = {
  $t: (key: string) => key,
}
