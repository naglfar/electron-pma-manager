<template>
	<Tabs ref="tabs">
		<template #after>
			<button class="btn" @click="showConnectionList">+</button>
		</template>
	</Tabs>
	<Modal
   	v-model="showConnectionModal"
    	:close="() => showConnectionModal = false"
  	>
		<div class="modal">
			<ConnectionList ref="list" @select="newConnection" />
			<button @click="showConnectionModal = false">close</button>
		</div>
	</Modal>
</template>

<script setup lang="ts">
import Tabs from './components/Tabs.vue'
import TabContent from './components/TabContent.vue'
import ConnectionList from './components/ConnectionList.vue'
import { useStore } from './store';
import { nextTick, onMounted, ref, unref } from 'vue';

const tabs = ref<typeof Tabs | null>(null);
const list = ref<typeof ConnectionList | null>(null);

const store = useStore();

let showConnectionModal = ref(false);
const showConnectionList = async () => {
	const connections = await (<any>window).electronAPI.getConnections();
	store.connections = connections;
	showConnectionModal.value = true;
	// wait for modal to render, seemingly needs two ticks
	nextTick(() => {
		nextTick(() => {
			list.value?.focus();
		})
	})
}

const newConnection = async (id: number) => {
	showConnectionModal.value = false;
	const connection = store.connections.find(c => c.id == id);
	await (<any>window).electronAPI.newConnection(connection.ssh_host, connection.id);
	const tunnels = await (<any>window).electronAPI.getTunnels();
	const index = tunnels.findIndex(tunnel => tunnel.connection == connection.id);
	tabs.value?.newTab(connection.name, index+1);
}

onMounted(() => {
	tabs.value?.newTab('tab1', 1);
	nextTick(() => {
		tabs.value?.newTab('tab2', 2);
		nextTick(() => {
			tabs.value?.newTab('tab3', 2);
		})
	});
	// showConnectionList();
});

</script>

<style lang="scss">
body, html {
	height: 100%;
	width: 100%;
	font-family: 'Source Sans Pro', 'Roboto', sans;
	color: #444;
}
#app {
	font-family: Avenir, Helvetica, Arial, sans-serif;
	-webkit-font-smoothing: antialiased;
	-moz-osx-font-smoothing: grayscale;
	text-align: center;
	color: #2c3e50;
	margin-top: 0;
	height: 100%;
	width: 100%;
}

.modal {
	display: flex;
	flex-direction: column;
	gap: 12px;
	width: 100%;
	max-width: 400px;
	max-height: 90vh;
	padding: 16px;
	box-sizing: border-box;
	background-color: #fff;
	font-size: 20px;
	text-align: center;
	border-radius: 3px;

	button {
		border: 1px solid #444;
		background-color: white;
		border-radius: 3px;
		padding: 4px 12px;
		align-self: end;
		cursor: pointer;
		transition: background-color 0.1s, color 0.1s;

		&:hover {
			background-color: #444;
			color: white;
		}

	}
}
</style>
