import 'sanitize.css';
import 'vue-universal-modal/dist/index.css'


import { createApp } from 'vue'
import { createPinia } from 'pinia'
import VueUniversalModal from 'vue-universal-modal'
import App from './App.vue'

createApp(App)
	.use(createPinia())
	.use(VueUniversalModal, {
		teleportTarget: '#modals'
	})
	.mount('#app')
