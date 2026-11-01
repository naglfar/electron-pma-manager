import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import vue from 'eslint-plugin-vue';
import globals from 'globals';

// rules that find mistakes, no formatting rules
export default tseslint.config(
	{
		ignores: ['dist/**', 'dist-build/**', 'node_modules/**'],
	},

	// electron main process and preload scripts (commonjs)
	{
		files: ['src/electron/**/*.js'],
		extends: [js.configs.recommended],
		languageOptions: {
			sourceType: 'commonjs',
			globals: { ...globals.node },
		},
	},
	{
		files: ['src/electron/electron-preload.js', 'src/electron/webview-preload.js'],
		languageOptions: {
			globals: { ...globals.browser },
		},
	},

	// node scripts and tests (esm)
	{
		files: ['scripts/**/*.mjs', 'test/**/*.mjs', '*.mjs'],
		extends: [js.configs.recommended],
		languageOptions: {
			globals: { ...globals.node },
		},
	},
	{
		files: ['test/**/*.cjs', 'test/**/*.js'],
		extends: [js.configs.recommended],
		languageOptions: {
			sourceType: 'commonjs',
			globals: { ...globals.node },
		},
	},

	// vue ui
	{
		files: ['src/vue/**/*.{ts,vue}'],
		extends: [
			js.configs.recommended,
			...tseslint.configs.recommended,
			...vue.configs['flat/essential'],
		],
		languageOptions: {
			globals: { ...globals.browser },
			parserOptions: {
				parser: tseslint.parser,
			},
		},
		rules: {
			// types of electron and third party objects are partly unknown
			'@typescript-eslint/no-explicit-any': 'warn',
			// declared types of src/vue/types are global
			'no-undef': 'off',
			// Tabs and App are single words
			'vue/multi-word-component-names': 'off',
			'no-unused-vars': 'off',
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
		},
	},

	// unused variables: an underscore marks them as intended
	{
		files: ['**/*.{js,mjs,cjs}'],
		rules: {
			'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
		},
	},
);
