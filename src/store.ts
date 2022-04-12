import { ref, Ref } from 'vue';
import { defineStore } from 'pinia';

export const useStore = defineStore('store', () => {
	const activeTab = ref('');
	const connections: Ref<Array<Connection>> = ref([]);
	return {
		activeTab,
		connections,
	}
})
