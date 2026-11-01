import { ref, Ref, toRaw, unref } from 'vue';
import { defineStore } from 'pinia';

export const useStore = defineStore('store', () => {
	const activeTab = ref('');
	const connections: Ref<Array<Connection>> = ref([]);
	const settings: Ref<Map<string, Settings[string]>> = ref(new Map());
	const pmaOptions: Ref<Map<string, Array<PMAOption>>> = ref(new Map);
	const saveSettings = async () => {
		if (window.electronAPI) {
			await window.electronAPI.saveSettings(Object.fromEntries((toRaw(unref(settings)))));
			// the main process may reject values, e.g. an unusable port
			settings.value = new Map(Object.entries(await window.electronAPI.getSettings()));
		}
	}
	const init = async() => {
		if (window.electronAPI) {
			const s = await window.electronAPI.getSettings();
			settings.value = new Map(Object.entries(s));
			const pmao = await window.electronAPI.getPMAOptions();
			pmaOptions.value = new Map(Object.entries(pmao));
		}
	}
	return {
		activeTab,
		connections,
		settings,
		pmaOptions,
		saveSettings,
		init
	}
})
