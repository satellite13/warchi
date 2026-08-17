import { createApp } from 'vue'
import '@fontsource/outfit/300.css'
import '@fontsource/outfit/400.css'
import '@fontsource/outfit/500.css'
import '@fontsource/outfit/600.css'
import '@fontsource/outfit/700.css'
import './style.css'
import './assets/buttons.css'
import './assets/forms.css'
import './assets/chips.css'
import App from './App.vue'
import UiIcon from './components/ui/UiIcon.vue'
import router from './router'
import i18n from './i18n'

const app = createApp(App)
app.component('UiIcon', UiIcon)
app.use(router).use(i18n).mount('#app')
