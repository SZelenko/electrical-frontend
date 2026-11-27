import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router, { watchSessionLoss } from './router'
import './assets.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)
watchSessionLoss()

app.mount('#app')
