<template>
<div class="c-tabs">
	<nav class="c-tabs__nav">
		<div class="c-tabs__bar" @wheel.passive="mouseWheel">
			<!-- fades at the edges show tabs scrolled out of view -->
			<div class="c-tabs__listwrap" :class="{ 'm--moreleft': moreLeft, 'm--moreright': moreRight }">
				<!-- pointer capture on the list, the tabs are moved in the dom while dragging -->
				<div
					class="c-tabs__list"
					ref="tabList"
					@scroll.passive="updateOverflow"
					@pointermove="dragMove"
					@pointerup="dragEnd"
					@pointercancel="dragEnd"
					@lostpointercapture="dragEnd"
				>
					<div
						v-for="tab in tabs"
						:key="tab.key"
						:ref="(el: any) => { tabElements[tab.key] = el; }"
						class="c-tabs__tab"
						:class="{ 'm--active': tab.key == activeTab, 'm--dragging': drag?.key == tab.key && drag.moved }"
						:style="drag?.key == tab.key ? { transform: `translateX(${drag.offset}px)` } : undefined"
						:title="tab.label"
						@pointerdown.left="dragStart($event, tab.key)"
						@mousedown.middle.prevent
						@mouseup.middle="closeTab(tab.key)"
					>
						<span class="c-tabs__label">{{ tab.label }}</span>
						<button class="c-tabs__close" title="Close tab" @pointerdown.stop @click.stop="closeTab(tab.key)">&times;</button>
					</div>
				</div>
			</div>
			<div class="c-tabs__after">
				<slot name="after"></slot>
			</div>
		</div>
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
		<!-- opening order, moving a webview in the dom reloads it -->
		<div
			class="c-tabs__content"
			v-for="tab in pages"
			:key="tab.key"
			v-show="tab.key == activeTab"
		>
			<div class="c-tabs__contentloader"><div></div><div></div></div>
			<webview
				:ref="(el: any) => { webviews[tab.key] = el; }"
				style="position: relative;"
				:src="`http://localhost:${serverport || 4406}/?server=${tab.server}`"
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
import { computed, nextTick, onMounted, onUnmounted, ref, Ref, watch } from 'vue'
import { useStore } from '../store';

const store = useStore();

const emit = defineEmits<{
	// no tab of this server is left
	(e: 'close-server', server: number): void
}>();

// don't change when settings change
const serverport = store.settings.get('startingport');

interface PMATab {
	key: string;
	label: string;
	server: number;
	opened: number;
};
const activeTab = ref('')
// order of the tab bar
const tabs: Ref<Array<PMATab>> = ref([]);
// order of opening, for the webviews
const pages = computed(() => [...tabs.value].sort((a, b) => a.opened - b.opened));
let tabCounter = 0;
const webviews:Ref<{[key: string]: any}> = ref({});
const searchInput:Ref<HTMLInputElement|null> = ref(null);
const searchShown = ref(false);
const searchLastInput = ref('');

const newTab = (label: string, server: number) => {
	const opened = ++tabCounter;
	const key = `tab${opened}`;
	// insert after the active tab
	const index = tabs.value.findIndex(t => t.key == activeTab.value);
	tabs.value.splice(index == -1 ? tabs.value.length : index + 1, 0, { key, label, server, opened });
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

// dragging tabs horizontally inside the tab bar
const tabList: Ref<HTMLElement|null> = ref(null);
const tabElements: { [key: string]: HTMLElement|null } = {};
const drag: Ref<{ key: string, pointerId: number, startX: number, offset: number, moved: boolean }|null> = ref(null);

const dragStart = (e: PointerEvent, key: string) => {
	activeTab.value = key;
	tabList.value?.setPointerCapture(e.pointerId);
	drag.value = { key, pointerId: e.pointerId, startX: e.clientX, offset: 0, moved: false };
};

// let a swapped neighbour slide into its new place
const slide = (el: HTMLElement, from: number) => {
	el.style.transition = 'none';
	el.style.transform = `translateX(${from}px)`;
	requestAnimationFrame(() => {
		el.style.transition = '';
		el.style.transform = '';
	});
};

const dragMove = (e: PointerEvent) => {
	const d = drag.value;
	const el = d && tabElements[d.key];
	if (!d || !el || e.pointerId != d.pointerId) {
		return;
	}
	let offset = e.clientX - d.startX;
	if (!d.moved && Math.abs(offset) < 4) {
		return;
	}
	d.moved = true;

	// swap with neighbours when crossing their middle,
	// left: position of the tab in the bar after the swaps (the dom is updated later)
	let left = el.offsetLeft;
	while (true) {
		const index = tabs.value.findIndex(t => t.key == d.key);
		const center = el.offsetLeft + offset + el.offsetWidth / 2;
		const next = tabs.value[index + 1] && tabElements[tabs.value[index + 1].key];
		const prev = tabs.value[index - 1] && tabElements[tabs.value[index - 1].key];
		if (next && center > next.offsetLeft + next.offsetWidth / 2) {
			tabs.value.splice(index + 1, 0, ...tabs.value.splice(index, 1));
			left += next.offsetWidth;
			slide(next, el.offsetWidth);
		} else if (prev && center < prev.offsetLeft + prev.offsetWidth / 2) {
			tabs.value.splice(index - 1, 0, ...tabs.value.splice(index, 1));
			left -= prev.offsetWidth;
			slide(prev, -el.offsetWidth);
		} else {
			break;
		}
	}
	d.startX += left - el.offsetLeft;
	offset -= left - el.offsetLeft;

	// keep the tab inside the bar
	const list = tabList.value;
	const max = (list?.scrollWidth || 0) - left - el.offsetWidth;
	d.offset = Math.max(-left, Math.min(max, offset));

	// scroll an overflowing bar along
	if (list) {
		const visualLeft = left + d.offset;
		if (visualLeft < list.scrollLeft) {
			list.scrollLeft = visualLeft;
		} else if (visualLeft + el.offsetWidth > list.scrollLeft + list.clientWidth) {
			list.scrollLeft = visualLeft + el.offsetWidth - list.clientWidth;
		}
	}
};

const dragEnd = (e: PointerEvent) => {
	if (drag.value?.pointerId == e.pointerId) {
		const clicked = !drag.value.moved;
		drag.value = null;
		if (clicked) {
			scrollActiveIntoView();
		}
	}
};

const closeTab = (key: string) => {
	const index = tabs.value.findIndex(t => t.key == key);
	if (index == -1) {
		return;
	}
	tabs.value.splice(index, 1);
	delete webviews.value[key];
	if (activeTab.value == key) {
		// activate the right neighbour, else the left one
		activeTab.value = tabs.value[Math.min(index, tabs.value.length - 1)]?.key || '';
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
	if ((<any>window).electronAPI) {
		dirname.value = await (<any>window).electronAPI.getDirname();
	}
	document.addEventListener('keydown', searchHotkey);
	searchInput.value?.addEventListener('keydown', searchInputKeydown)
});
onUnmounted(() => {
	document.removeEventListener('keyup', searchHotkey);
	searchInput.value?.removeEventListener('keydown', searchInputKeydown)
})

// tabs that don't fit into the bar: the list scrolls
const moreLeft = ref(false);
const moreRight = ref(false);

const scrollActiveIntoView = () => {
	if (!drag.value) {
		tabElements[activeTab.value]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
	}
};

const updateOverflow = () => {
	const list = tabList.value;
	moreLeft.value = !!list && list.scrollLeft > 1;
	moreRight.value = !!list && list.scrollLeft + list.clientWidth < list.scrollWidth - 1;
};

// keep the active tab visible in an overflowing bar
watch(activeTab, () => nextTick(scrollActiveIntoView));
watch(() => tabs.value.length, () => nextTick(updateOverflow));
watch(activeTab, () => nextTick(updateOverflow));

let resizeObserver: ResizeObserver|null = null;
onMounted(() => {
	resizeObserver = new ResizeObserver(() => {
		updateOverflow();
		scrollActiveIntoView();
	});
	if (tabList.value) {
		resizeObserver.observe(tabList.value);
	}
});
onUnmounted(() => {
	resizeObserver?.disconnect();
});

// changed phpMyAdmin theme: reload hidden tabs now, the visible one when it is left
// (or right away for changes from the settings), so no unsaved input is lost unasked
const pendingReload = new Set<string>();
const reloadWebview = (key: string) => {
	pendingReload.delete(key);
	try {
		webviews.value[key]?.reload();
	} catch (e) {
		// not attached yet, it loads with the current theme anyway
	}
};
watch(activeTab, (key, oldKey) => {
	if (pendingReload.has(oldKey)) {
		reloadWebview(oldKey);
	}
});
onMounted(() => {
	(<any>window).electronAPI?.onPMAThemeChanged(({ reloadActive }: { reloadActive: boolean }) => {
		tabs.value.forEach(tab => {
			if (tab.key != activeTab.value || reloadActive) {
				reloadWebview(tab.key);
			} else {
				pendingReload.add(tab.key);
			}
		});
	});
});

watch(() => tabs.value.map(t => t.server), (servers, oldServers) => {
	new Set(oldServers).forEach(server => {
		if (!servers.includes(server)) {
			emit('close-server', server);
		}
	});
});

defineExpose({ newTab });
</script>

<style lang="scss">
.c-tabs {
	display: flex;
	flex-direction: column;
	height: 100%;
	width: 100%;

	&__nav {
		display: flex;
		background: var(--c-bar);
	}

	&__bar {
		flex: 1;
		display: flex;
		align-items: flex-end;
		min-width: 0;
		padding: 6px 0 0 6px;
	}

	&__listwrap {
		position: relative;
		display: flex;
		min-width: 0;

		&::before,
		&::after {
			content: '';
			position: absolute;
			z-index: 3;
			top: 0;
			bottom: 0;
			width: 24px;
			pointer-events: none;
			opacity: 0;
			transition: opacity 0.15s;
		}
		&::before {
			left: 0;
			background: linear-gradient(to right, var(--c-bar), transparent);
		}
		&::after {
			right: 0;
			background: linear-gradient(to left, var(--c-bar), transparent);
		}
		&.m--moreleft::before,
		&.m--moreright::after {
			opacity: 1;
		}
	}

	&__list {
		display: flex;
		position: relative;
		min-width: 0;
		overflow-x: auto;
		overflow-y: hidden;
		scrollbar-width: none;

		&::-webkit-scrollbar {
			display: none;
		}
	}

	&__tab {
		display: flex;
		align-items: center;
		gap: 4px;
		flex: 0 1 220px;
		width: 220px;
		// 3 characters, ellipsis and close button
		min-width: 80px;
		height: 34px;
		padding: 0 6px 0 12px;
		border-radius: 8px 8px 0 0;
		color: var(--c-tab-text);
		font-size: 13px;
		cursor: default;
		user-select: none;
		position: relative;

		// separator between inactive tabs
		&:not(.m--active):not(:first-child)::before {
			content: '';
			position: absolute;
			left: 0;
			top: 9px;
			bottom: 9px;
			border-left: 1px solid var(--c-tab-separator);
		}
		&.m--active + &::before,
		&:hover + &::before,
		&:hover::before {
			display: none;
		}

		&:hover:not(.m--active) {
			background-color: var(--c-tab-hover);
		}

		&.m--active {
			background-color: var(--c-tab-active);
			color: var(--c-tab-active-text);
			z-index: 1;
		}

		transition: transform 0.15s;

		&.m--dragging {
			transition: none;
			z-index: 2;
		}
	}

	&__label {
		flex: 1;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		text-align: left;
	}

	&__close {
		flex: none;
		width: 18px;
		height: 18px;
		padding: 0;
		border: 0;
		border-radius: 50%;
		background: transparent;
		color: inherit;
		font-size: 16px;
		line-height: 18px;

		&:hover {
			background-color: var(--c-overlay-hover);
		}
	}

	&__after {
		display: flex;
		align-items: center;
		height: 34px;
		padding: 0 6px;

		button {
			background-color: var(--c-tab-active);
			border: 0;
			border-radius: 2px;
			aspect-ratio: 1;
			height: 20px;
			line-height: 20px;

			&:hover {
				background-color: var(--c-tab-hover);
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
				outline: 5px solid var(--c-text-strong);
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
	background: var(--c-bar);
	&__button {
		height: calc(100% - 12px);
		border: 0;
		color: var(--c-text);
		font-size: 24px;
		line-height: 24px;
		padding: 6px 1px 0 6px;
		margin: 6px 6px 6px 0;
		border-radius: 3px;
		background: transparent;

		&:hover {
			background: var(--c-overlay-hover);
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
		background-color: var(--c-menu-bg);
		box-shadow: 0px 0px 5px var(--c-shadow);
		opacity: 0;
		transition: opacity 0.2s, z-index 0s linear 0.2s;
		text-align: left;

		li {
			padding: 6px 24px;
			white-space: nowrap;
			cursor: pointer;

			&:hover {
				background-color: var(--c-hover);
			}

			&.m--disabled {
				background-color: var(--c-menu-bg);
				opacity: 0.3;
				pointer-events: none;
			}
		}
	}
}
.c-search {
	background-color: var(--c-surface);
	border-top: 1px solid var(--c-border-strong);
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