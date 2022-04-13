<template>
	<Tabs ref="tabs">
		<template #after>
			<button class="btn" @click="connectionList?.show()">+</button>
		</template>
		<template #menu>
			<li @click="connectionManager?.show()">Manage connections</li>
			<li @click="settingsDialog?.show()">Settings</li>
		</template>
	</Tabs>
	<ConnectionList ref="connectionList" @select="newConnection" />
	<ConnectionManager ref="connectionManager" />
	<SettingsDialog ref="settingsDialog" />
</template>

<script setup lang="ts">
import Tabs from './components/Tabs.vue'
import ConnectionList from './components/ConnectionList.vue'
import ConnectionManager from './components/ConnectionManager.vue'
import SettingsDialog from './components/SettingsDialog.vue'
import { useStore } from './store';
import { onMounted, ref, unref } from 'vue';

const tabs = ref<typeof Tabs | null>(null);
const connectionList = ref();
const connectionManager = ref();
const settingsDialog = ref();

const store = useStore();

const newConnection = async (id: number) => {
	const connection = store.connections.find(c => c.id == id);
	if (connection) {
		await (<any>window).electronAPI.newConnection(connection.ssh_host, connection.id);
		const tunnels: Array<Tunnel> = await (<any>window).electronAPI.getTunnels();
		const index = tunnels.findIndex(tunnel => tunnel.connection == connection.id);
		tabs.value?.newTab(connection.name, index+1);
	}
}

onMounted(async () => {
	if ((<any>window).electronAPI) {
		store.connections = await (<any>window).electronAPI.getConnections();
		const favorites = store.connections.filter((c) => c.favorite);
		favorites.forEach((c) => {
			newConnection(c.id);
		})
		if (favorites.length == 0) {
			connectionList.value?.show();
		}
	}
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

#modals {
	position: relative;
	z-index: 10;
}

.o-modal {
	display: flex;
	position: relative;
	flex-direction: column;
	gap: 12px;
	width: 100%;
	max-width: 400px;
	max-height: 90vh;
	padding: 16px;
	box-sizing: border-box;
	background-color: #fff;
	border-radius: 3px;
}

.o-btn {
	border: 1px solid #444;
	// background-color: white;
	background-color: #444;
	color: white;
	border-radius: 3px;
	padding: 4px 12px;
	cursor: pointer;
	transition: background-color 0.1s, color 0.1s;

	&:hover {
		background-color: #777;
		// color: #444;
	}

	&--secondary {
		background-color: white;
		color: #444;

		&:hover {
			background-color: #ddd;
			// color: white;
		}
	}
	&[disabled] {
		opacity: 0.3;
	}
}
</style>
