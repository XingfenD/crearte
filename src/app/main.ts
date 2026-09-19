import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import { authEnabled, session } from './auth'
import './styles/main.css'

if (authEnabled) void session.restore()

createApp(App).use(router).mount('#app')
