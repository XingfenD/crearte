import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import { session } from './auth'
import './styles/main.css'

void session.restore()

createApp(App).use(router).mount('#app')
