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
import { onMounted, ref, toRaw, unref } from 'vue';

const tabs = $ref<typeof Tabs>();
const connectionList = $ref<typeof ConnectionList>();
const connectionManager = $ref<typeof ConnectionManager>();
const settingsDialog = $ref<typeof SettingsDialog>();

const store = useStore();

const newConnection = async (id: number) => {
	const connection = store.connections.find(c => c.id == id);
	if (connection) {
		await (<any>window).electronAPI.newConnection(toRaw(unref(connection)));
		const tunnels: Array<Tunnel> = await (<any>window).electronAPI.getTunnels();
		const index = tunnels.findIndex(tunnel => tunnel.connection == connection.id);
		tabs.newTab(connection.name, index+1);
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
			connectionList.show();
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
	font-size: 16px;
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

.flex { display: flex; }
.flex-column { flex-direction: column; }

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
	background-color: #f1f1f1;
	border-radius: 3px;
	overflow: hidden;

	&--nopadding {
		padding: 0;
	}
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

.tabs-component {
	&-tabs {
		display: flex;
		margin: 0;
		padding: 6px 6px 0 6px;
		list-style: none;
		background-color: #ccc;
	}
	&-tab {
		border-radius: 4px 4px 0 0;
		padding: 4px 16px;

		transition: background-color 0.1s;

		&:hover {
			background-color: #d9d9d9;
		}

		&.is-active {
			background-color: #f1f1f1;
		}

		a {
			color: inherit;
			text-decoration: none;
		}
	}
	&-panels {
		padding: 16px;
	}
}

input[disabled] {
	color: transparent;
}
</style>
