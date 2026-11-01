<template>
	<Modal
   	v-model="showModal"
    	:close="() => showModal = false"
  	>
		<div class="c-connectionlist o-modal">
			<div class="c-connectionlist__list" v-show="store.connections.length > 0">
				<input
					class="c-connectionlist__filter"
					ref="input"
					type="search"
					@input="filter"
					@keypress.enter="() => marked && select(marked)"
				>
				<ul>
					<li
						v-for="connection in store.connections"
						:key="connection.id"
						:class="{
							'marked': marked == connection.id,
							'hide': matched && !matched.includes(connection.id)
						}"
						@click="select(connection.id)"
					>
						{{connection.name}}
					</li>
				</ul>
				<div class="c-connectionlist__nomatch" v-show="matched && matched.length == 0">
					No matching connections
				</div>
			</div>
			<div class="c-connectionlist__empty" v-show="store.connections.length == 0">
				No connections
			</div>
			<div class="c-connectionlist__buttons">
				<button class="o-btn o-btn--secondary" @click="connectionManager?.show()">manage</button>
				<button class="o-btn" @click="showModal = false">close</button>
			</div>
		</div>
	</Modal>
	<ConnectionManager ref="connectionManager" />
</template>

<script setup lang="ts">
import { nextTick, ref, Ref } from 'vue';
import { useStore } from '../store';
import ConnectionManager from './ConnectionManager.vue'
const store = useStore();
const input = ref<HTMLInputElement | null>(null);
const connectionManager = ref<typeof ConnectionManager | null>(null);
const showModal = ref(false);
const marked: Ref<number|undefined> = ref();
// ids matching the filter, null without filter
const matched: Ref<Array<number>|null> = ref(null);

const emit = defineEmits(['select']);

const show = async () => {
	showModal.value = true;
	store.connections = await window.electronAPI?.getConnections() ?? [];

	// wait for modal to render, seemingly needs two ticks
	nextTick(() => {
		nextTick(() => {
			input.value?.focus();
		})
	})
}

const filter = (e: Event) => {
	const query = (e.target as HTMLInputElement).value.trim().toLowerCase();
	if (!query) {
		marked.value = undefined;
		matched.value = null;
		return;
	}
	const cs = store.connections.filter((c) => c.name.toLowerCase().includes(query));
	marked.value = cs[0]?.id;
	matched.value = cs.map(c => c.id);
}

const select = (id: number) => {
	emit('select', id);
	showModal.value = false;
}

defineExpose({ show });
</script>

<style lang="scss" scoped>
.c-connectionlist {
	// the list scrolls, filter and buttons stay visible
	max-height: min(80vh, 600px);

	&__list {
		display: flex;
		flex-direction: column;
		flex: 1 1 auto;
		min-height: 0;
	}

	&__nomatch {
		padding: 12px;
		opacity: 0.7;
	}

	&__filter {
		flex: none;
		width: 100%;
		padding: 4px 12px;
		border-radius: 3px;
		border: 1px solid var(--c-border-strong);
		font-size: inherit;
		font-family: inherit;
		color: inherit;
		outline: 0;
	}

	ul {
		padding: 0;
		margin: 0;
		list-style-type: none;
		text-align: left;
		flex: 1 1 auto;
		min-height: 0;
		overflow: auto;
		margin-top: 8px;

		li {
			position: relative;
			cursor: pointer;
			padding: 4px 12px;
			margin: 8px 0;
			transition: background-color 0.1s;
			&:not(:last-child) {
				&:after {
					content: '';
					position: absolute;
					width: 100%;
					left: 0;
					bottom: -4px;
					display: block;
					border-bottom: 1px solid var(--c-border);
				}
			}
			&:hover {
				background-color: var(--c-hover);
			}

			&.hide {
				display: none;
			}
			&.marked {
				background-color: var(--c-selected);
			}
		}
	}

	&__buttons {
		flex: none;
		display: flex;
		flex-direction: row;
		gap: 6px;
		width: 100%;
		justify-content: end;
	}
}
</style>