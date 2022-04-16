import { ref, Ref, toRaw, unref } from 'vue';
import { defineStore } from 'pinia';

export const useStore = defineStore('store', () => {
	const activeTab = ref('');
	const connections: Ref<Array<Connection>> = ref([]);
	const settings: Ref<Map<String, String>> = ref(new Map());
	const pmaOptions: Ref<Map<String, Array<PMAOption>>> = ref(new Map);
	const saveSettings = async () => {
		await (<any>window).electronAPI.saveSettings(Object.fromEntries((toRaw(unref(settings)))));
	}
	const init = async() => {
		const s = await (<any>window).electronAPI.getSettings();
		settings.value = new Map(Object.entries(s));
		const pmao = await (<any>window).electronAPI.getPMAOptions();
		pmaOptions.value = new Map(Object.entries(pmao));
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
