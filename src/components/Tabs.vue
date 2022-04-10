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
			<div class="c-tabs__contentloader"><div></div><div></div></div>
			<webview style="position: relative;" :src="`http://localhost:4405/pma/?server=${tab.server}`" />
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
</style>