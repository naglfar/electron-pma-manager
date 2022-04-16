<template>
<div class="c-tabs">
	<nav class="c-tabs__nav">
		<vue3-tabs-chrome
			:ref="setTabRef"
			v-model="activeTab"
			:tabs="tabs"
			class="c-tabs__bar"
			@mousedown.middle="mouseMiddle"
			@mousewheel="mouseWheel"
		>
			<template #after>
				<slot name="after"></slot>
			</template>
		</vue3-tabs-chrome>
		<div class="c-menu">
			<button
				class="c-menu__button"
				ref="menuButton"
				@mousedown="menuClick"
			>
				&#10247;
			</button>
			<ul class="c-menu__list">
				<li :class="{ 'm--disabled' : !activeTab }" @click="webviewDevtools">Open tab devtools</li>
				<li :class="{ 'm--disabled' : !activeTab }" @click="webviewReload">Reload tab</li>
				<li :class="{ 'm--disabled' : !activeTab }" @click="webviewDuplicate">Duplicate tab</li>
				<slot name="menu"></slot>
			</ul>
		</div>
	</nav>
	<div class="c-tabs__container">
		<div
			class="c-tabs__content"
			v-for="tab in tabs"
			:key="tab.key"
			v-show="tab.key == activeTab"
		>
			<div class="c-tabs__contentloader"><div></div><div></div></div>
			<webview
				:ref="(el) => { webviews[tab.key] = el; }"
				style="position: relative;"
				:src="`http://localhost:${serverport || 4406}/pma/?server=${tab.server}`"
				:preload="`file://${dirname}/webview-preload.js`"
			/>
		</div>
		<div class="c-search" v-show="searchShown">
			<div class="c-search__controls">
				<input ref="searchInput" type="search" class="c-search__input" @input="() => doSearch" @keydown.enter="searchInputEnter">
			</div>
			<div class="c-search__close" @click="hideSearch">X</div>
		</div>
	</div>
</div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, reactive, ref, Ref, toRaw, watchEffect } from 'vue'
import 'vue3-tabs-chrome/dist/vue3-tabs-chrome.css'
import Vue3TabsChrome, {Tab} from 'vue3-tabs-chrome'
import { useStore } from '../store';

const store = useStore();

// don't change when settings change
const serverport = store.settings.get('startingport');

interface PMATab extends Tab {
   server: number;
};
// FIXME: for typescript
let webview: any;

const tabRef = ref();
const activeTab = ref('')
const tabs: Ref<Array<PMATab>> = ref([]);
const webviews:Ref<{[key: string]: any}> = ref({});
const searchInput:Ref<HTMLInputElement|null> = ref(null);
const searchShown = ref(false);
const searchLastInput = ref('');

const setTabRef = (el: HTMLElement) => {
	tabRef.value = el
};

const newTab = (label: string, server: number) => {
	const key = 'tab' + Date.now()
	tabRef.value.addTab({
		label,
		key,
		server
	});
	activeTab.value = key

	nextTick(() => {
		const webview = webviews.value[key];
		webview.addEventListener('dom-ready', async () => {
			// webview.openDevTools();
			// FIXME: type?
			webview.addEventListener('ipc-message', (e: any) => {
				if (e.channel === 'webview-keypress') {
					if (e.args[0] == 'ctrl-f') {
						showSearch();
						doSearch();
					}
				}
			})
		})
	});
};

const mouseMiddle = (e: MouseEvent) => {
	const tabEl = (e.target as HTMLElement)?.closest('.tabs-item');
	if (tabEl) {
		const tab = tabs.value.find(t => t.$el == tabEl);
		if (tab) {
			tabRef.value.removeTab(tab.key);
		}
	}
};

const mouseWheel = (e: WheelEvent) => {
	// e.deltaY
	const current = tabs.value.find(t => t.key == activeTab.value);
	if (current) {
		const index = tabs.value.indexOf(current);
		if (e.deltaY < 0 && index > 0) {
			activeTab.value = tabs.value[index - 1].key;
		} else if (e.deltaY > 0 && index < tabs.value.length - 1) {
			activeTab.value = tabs.value[index + 1].key;

		}
	}
};

let menuButton = ref();
const menuClick = () => {
	if (menuButton.value == document.activeElement) {
		setTimeout(() => {
			menuButton.value.blur();
		}, 1);
	}
};
const webviewDevtools = () => {
	const webview = webviews.value[activeTab.value];
	webview.openDevTools();
};
const webviewReload = () => {
	const webview = webviews.value[activeTab.value];
	webview.reload();
};
const webviewDuplicate = () => {
	const tab = tabs.value.find(t => t.key == activeTab.value);
	if (tab) {
		newTab(tab.label, tab.server);
	}
}


// const searchParams = ref({});
const showSearch = () => {
	searchShown.value = true;
	searchInput.value!.value = searchLastInput.value;
	nextTick(() => {
		searchInput.value?.focus();
	})
};
const hideSearch = () => {
	const webview = webviews.value[activeTab.value];
	webview?.stopFindInPage('clearSelection');
	searchShown.value = false;
};
const doSearch = (forward = true) => {
	const searchText = searchInput.value?.value || '';
	const webview = webviews.value[activeTab.value];
	if (searchText) {
		webview?.findInPage(searchText, {forward});
	} else {
		webview?.stopFindInPage('clearSelection');
	}
};

const searchHotkey = (e: KeyboardEvent) => {
	if (e.ctrlKey && e.key == 'f') {
		showSearch();
		doSearch();
	}
}
const searchInputKeydown = (e: KeyboardEvent) => {
	if (e.key == 'Escape') {
		searchLastInput.value = searchInput.value?.value || '';
		hideSearch();
	}
};
const searchInputEnter = (e: KeyboardEvent) => {
	if (e.key == 'Enter') {
		doSearch(!e.shiftKey);
	}
};

let dirname = ref('');
onMounted(async () => {
	dirname.value = await (<any>window).electronAPI.getDirname();
	document.addEventListener('keydown', searchHotkey);
	searchInput.value?.addEventListener('keydown', searchInputKeydown)
});
onUnmounted(() => {
	document.removeEventListener('keyup', searchHotkey);
	searchInput.value?.removeEventListener('keydown', searchInputKeydown)
})

defineExpose({ newTab });
</script>

<style lang="scss">
.c-tabs {
	display: flex;
	flex-direction: column;
	height: 100%;
	width: 100%;

	.tabs-close-icon {
		vertical-align: top;
		cursor: pointer;
	}

	&__nav {
		display: flex;
	}

	&__bar {
		flex: 1;
		button {
			background-color: #fff;
			border: 0;
			border-radius: 2px;
			aspect-ratio: 1;
			height: 20px;
			line-height: 20px;

			&:hover {
				background-color: #f1f1f1;
			}
		}
	}

	&__container {
		display: flex;
		flex-direction: column;
		height: 100%;
		width: 100%;

		.c-tabs__content {
			flex: 1;

			webview {
				height: 100%;
			}
		}
	}

	&__content {
		position: relative;

		&loader {
			position: absolute;
			margin: auto;
			top: 0;
			left: 0;
			bottom: 0;
			right: 0;
			width: 10vw;
			height: 10vw;

			div {
				position: absolute;
				outline: 5px solid #000;
				opacity: 1;
				border-radius: 50%;
				animation: lds-ripple 1s cubic-bezier(0, 0.2, 0.8, 1) infinite;
				&:nth-child(2) {
					animation-delay: -0.5s;
				}
			}
			@keyframes lds-ripple {
				0% {
					top: calc(50%);
					left: calc(50%);
					width: 0;
					height: 0;
					opacity: 1;
					outline-width: 0vw;
				}
				50% {
					outline-width: 0.5vw;
				}
				100% {
					top: 0;
					left: 0;
					width: calc(100%);
					height: calc(100%);
					opacity: 0;
					outline-width: 2vw;
				}
			}
		}
	}

	button {
		cursor: pointer;
	}
}
.c-menu {
	position: relative;
	background: #dee1e6;
	&__button {
		height: calc(100% - 12px);
		border: 0;
		color: #444;
		font-size: 24px;
		line-height: 24px;
		padding: 6px 1px 0 6px;
		margin: 6px 6px 6px 0;
		border-radius: 3px;
		background: transparent;

		&:hover {
			background: #d1d1d1;
		}

		&:focus + ul {
			opacity: 1;
			z-index: 5;
			transition: opacity 0.2s;
		}
	}
	&__list {
		position: absolute;
		z-index: -1;
		right: 0;
		top: calc(100% - 6px);
		margin: 0;
		background-color: #f9f9f9;
		box-shadow: 0px 0px 5px rgba(0, 0, 0, 0.3);
		opacity: 0;
		transition: opacity 0.2s, z-index 0s linear 0.2s;
		text-align: left;

		li {
			padding: 6px 24px;
			white-space: nowrap;
			cursor: pointer;

			&:hover {
				background-color: #eee;
			}

			&.m--disabled {
				background-color: #f9f9f9;
				opacity: 0.3;
				pointer-events: none;
			}
		}
	}
}
.c-search {
	background-color: #f1f1f1;
	border-top: 1px solid #bbb;
	display: flex;
	justify-content: space-between;
	padding: 8px;

	&__controls {

	}

	input {
		padding: 4px 8px;
	}

	&__close {
		display: flex;
		justify-content: center;
		align-items: center;
		height: 100%;
		aspect-ratio: 1;
		cursor: pointer;
		font-size: 16px;
		line-height: 1em;
	}

}
</style>