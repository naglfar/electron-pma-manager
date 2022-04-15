import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [
		vue({
			reactivityTransform: true,
			template: {
				compilerOptions: {
					isCustomElement: tag => ['webview', 'svg'].indexOf(tag) != -1
				}
			}
		})
	]
})
