import 'sanitize.css';
import 'vue-universal-modal/dist/index.css'


import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { useStore } from './store';
import VueUniversalModal from 'vue-universal-modal'
import App from './App.vue'

const pinia = createPinia();
const store = useStore(pinia);
await store.init();

createApp(App)
	.use(pinia)
	.use(VueUniversalModal, {
		teleportTarget: '#modals'
	})
	.mount('#app')
