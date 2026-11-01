import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
	base: './',
	root: 'src/vue',
	server: {
		host: '127.0.0.1',
		port: 3000,
		strictPort: true,
	},
	build: {
		target: 'esnext',
		outDir: '../../dist',
		emptyOutDir: true
	},
	plugins: [
		vue({
			template: {
				compilerOptions: {
					isCustomElement: tag => ['webview', 'svg'].indexOf(tag) != -1
				}
			}
		})
	]
})
