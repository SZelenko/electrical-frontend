import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import { i18n } from './i18n'
import { vuetify } from './plugins/vuetify'
import router, { watchSessionLoss } from './router'
import './assets.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(i18n)
app.use(vuetify)
watchSessionLoss()

app.mount('#app')
