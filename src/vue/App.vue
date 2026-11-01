<template>
	<Tabs
		ref="tabs"
		@close-server="closeConnection"
		@new-tab="connectionList?.show()"
		@access-denied="retryPassword"
	>
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
	<PasswordPrompt ref="passwordPrompt" />
</template>

<script setup lang="ts">
import Tabs from './components/Tabs.vue'
import ConnectionList from './components/ConnectionList.vue'
import ConnectionManager from './components/ConnectionManager.vue'
import SettingsDialog from './components/SettingsDialog.vue'
import PasswordPrompt from './components/PasswordPrompt.vue'
import { useStore } from './store';
import { onMounted, useTemplateRef } from 'vue';

const tabs = useTemplateRef<InstanceType<typeof Tabs>>('tabs');
const connectionList = useTemplateRef<InstanceType<typeof ConnectionList>>('connectionList');
const connectionManager = useTemplateRef<InstanceType<typeof ConnectionManager>>('connectionManager');
const settingsDialog = useTemplateRef<InstanceType<typeof SettingsDialog>>('settingsDialog');
const passwordPrompt = useTemplateRef<InstanceType<typeof PasswordPrompt>>('passwordPrompt');

const store = useStore();

const newConnection = async (id: number) => {
	const connection = store.connections.find(c => c.id == id);
	const api = window.electronAPI;
	if (connection && api) {
		try {
			// "ask on connect": the password is only kept by the main process while the connection is open
			let password: string | undefined;
			if (await api.connectionNeedsPassword(connection.id)) {
				const entered = await passwordPrompt.value?.ask(connection.name);
				if (entered == null) {
					return;
				}
				password = entered;
			}
			// phpMyAdmin server index, errors are shown by the main process
			const server: number = await api.newConnection({ id: connection.id }, password);
			tabs.value?.newTab(connection.name, server);
		} catch (e) {
			// shown by the main process
		}
	}
}

// rejected "ask on connect" password: ask again, once for all tabs of the connection
const retrying = new Set<number>();
const retryPassword = async (id: number) => {
	const api = window.electronAPI;
	const connection = store.connections.find(c => c.id == id);
	if (!api || !connection || retrying.has(id)) {
		return;
	}
	retrying.add(id);
	try {
		await api.forgetPassword(id);
		// only "ask on connect" connections need a password now
		if (await api.connectionNeedsPassword(id)) {
			const entered = await passwordPrompt.value?.ask(connection.name, 'The password was rejected.');
			if (entered != null) {
				await api.newConnection({ id }, entered);
				tabs.value?.reloadServer(id);
			}
		}
	} catch (e) {
		// shown by the main process
	} finally {
		retrying.delete(id);
	}
};

const closeConnection = async (id: number) => {
	await window.electronAPI?.closeConnection(id);
}

onMounted(async () => {
	if (window.electronAPI) {
		store.connections = await window.electronAPI.getConnections();
		const favorites = store.connections.filter((c) => c.favorite);
		// one after another, connections may ask for a password
		for (const c of favorites) {
			await newConnection(c.id);
		}
		if (favorites.length == 0) {
			connectionList.value?.show();
		}
	}
});

</script>

<style lang="scss">
// colors, dark values follow prefers-color-scheme which the main process sets from the ui theme setting
:root {
	color-scheme: light dark;

	--c-bg: #ffffff;
	--c-text: #444444;
	--c-text-strong: #2c3e50;
	--c-surface: #f1f1f1;
	--c-surface-raised: #ffffff;
	--c-border: #dddddd;
	--c-border-strong: #bbbbbb;
	--c-hover: #eeeeee;
	--c-selected: #dddddd;
	--c-overlay-hover: rgba(0, 0, 0, 0.1);
	--c-shadow: rgba(0, 0, 0, 0.3);

	--c-btn-bg: #444444;
	--c-btn-text: #ffffff;
	--c-btn-hover: #777777;
	--c-btn2-bg: #ffffff;
	--c-btn2-text: #444444;
	--c-btn2-hover: #dddddd;

	--c-bar: #dee1e6;
	--c-tab-text: #45474a;
	--c-tab-separator: #a8abb0;
	--c-tab-hover: #e9ebee;
	--c-tab-active: #ffffff;
	--c-tab-active-text: #202124;
	--c-menu-bg: #f9f9f9;

	--c-subtabs-bg: #cccccc;
	--c-subtabs-hover: #d9d9d9;

	--c-error-bg: #ffdddd;
	--c-error-text: #cc4444;

	@media (prefers-color-scheme: dark) {
		--c-bg: #202124;
		--c-text: #d5d7da;
		--c-text-strong: #e8eaed;
		--c-surface: #292a2d;
		--c-surface-raised: #35363a;
		--c-border: #45474b;
		--c-border-strong: #5f6368;
		--c-hover: #3c3d41;
		--c-selected: #4a4c50;
		--c-overlay-hover: rgba(255, 255, 255, 0.12);
		--c-shadow: rgba(0, 0, 0, 0.6);

		--c-btn-bg: #c4c7c5;
		--c-btn-text: #202124;
		--c-btn-hover: #e3e3e3;
		--c-btn2-bg: #35363a;
		--c-btn2-text: #e3e3e3;
		--c-btn2-hover: #4a4c50;

		--c-bar: #1f2023;
		--c-tab-text: #bdc1c6;
		--c-tab-separator: #5f6368;
		--c-tab-hover: #2c2d31;
		--c-tab-active: #35363a;
		--c-tab-active-text: #e8eaed;
		--c-menu-bg: #292a2d;

		--c-subtabs-bg: #1f2023;
		--c-subtabs-hover: #2c2d31;

		--c-error-bg: #5c2b29;
		--c-error-text: #f28b82;
	}
}

body, html {
	background-color: var(--c-bg);
	height: 100%;
	width: 100%;
	font-family: 'Source Sans Pro', 'Roboto', sans;
	color: var(--c-text);
	font-size: 16px;
}
#app {
	font-family: Avenir, Helvetica, Arial, sans-serif;
	-webkit-font-smoothing: antialiased;
	-moz-osx-font-smoothing: grayscale;
	text-align: center;
	color: var(--c-text-strong);
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
	background-color: var(--c-surface);
	border-radius: 3px;
	overflow: hidden;

	&--nopadding {
		padding: 0;
	}
}

.o-btn {
	border: 1px solid var(--c-btn-bg);
	// background-color: white;
	background-color: var(--c-btn-bg);
	color: var(--c-btn-text);
	border-radius: 3px;
	padding: 4px 12px;
	cursor: pointer;
	transition: background-color 0.1s, color 0.1s;

	&:hover {
		background-color: var(--c-btn-hover);
		// color: #444;
	}

	&--secondary {
		background-color: var(--c-btn2-bg);
		color: var(--c-btn2-text);

		&:hover {
			background-color: var(--c-btn2-hover);
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
		background-color: var(--c-subtabs-bg);
	}
	&-tab {
		border-radius: 4px 4px 0 0;
		padding: 4px 16px;

		transition: background-color 0.1s;

		&:hover {
			background-color: var(--c-subtabs-hover);
		}

		&.is-active {
			background-color: var(--c-surface);
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
