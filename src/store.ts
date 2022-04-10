import { ref } from 'vue';
import { defineStore } from 'pinia';

export const useStore = defineStore('store', () => {
	const activeConnections = ref([]);
	const activeTab = ref('');
	const connections = ref([]);
	return {
		activeConnections,
		activeTab,
		connections,
	}
})
