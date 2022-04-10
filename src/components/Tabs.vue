<template>
<div class="c-tabs">
 	<vue3-tabs-chrome
	 	:ref="setTabRef"
		class="c-tabs__nav"
		v-model="activeTab"
		:tabs="tabs"
		@mousedown.middle="mouseMiddle"
		@mousewheel="mouseWheel"
	>
	 	<template #after>
			 <slot name="after"></slot>
		</template>
	</vue3-tabs-chrome>
	<div class="c-tabs__container">
		<div class="c-tabs__content" v-for="tab in tabs" :key="tab.key" v-show="tab.key == activeTab">
			<webview :src="`http://localhost:5555/pma/?server=${tab.server}`" />
		</div>
	</div>
</div>
</template>

<script setup lang="ts">
import { reactive, ref, Ref, watchEffect } from 'vue'
import 'vue3-tabs-chrome/dist/vue3-tabs-chrome.css'
import Vue3TabsChrome, {Tab} from 'vue3-tabs-chrome'
import { useStore } from '../store';

const store = useStore();

const tabRef = ref()
const activeTab = ref('')
const tabs: Ref<Array<Tab>> = ref([]);

const setTabRef = (el: HTMLElement) => {
	tabRef.value = el
}

const newTab = (label: string, server: number) => {
	const key = 'tab' + Date.now()
	tabRef.value.addTab({
		label,
		key,
		server
	});
	activeTab.value = key
}

const mouseMiddle = (e: MouseEvent) => {
	const tabEl = (e.target as HTMLElement)?.closest('.tabs-item');
	if (tabEl) {
		const tab = tabs.value.find(t => t.$el == tabEl);
		if (tab) {
			tabRef.value.removeTab(tab.key);
		}
	}
}

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
}

defineExpose({ newTab });
</script>

<style lang="scss">
.c-tabs {
	display: flex;
	flex-direction: column;
	height: 100%;
	width: 100%;

	&__container, &__container * {
		height: 100%;
		width: 100%;
	}

	button {
		cursor: pointer;
	}
}
</style>