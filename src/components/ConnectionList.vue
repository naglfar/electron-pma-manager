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
							'hide': matched.length && !matched.includes(connection.id)
						}"
						@click="select(connection.id)"
					>
						{{connection.name}}
					</li>
				</ul>
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
import { defineEmits, nextTick, onMounted, ref, Ref } from 'vue';
import { useStore } from '../store';
import ConnectionManager from './ConnectionManager.vue'
const store = useStore();
const input = ref<HTMLInputElement | null>(null);
const connectionManager = ref<typeof ConnectionManager | null>(null);
let showModal = ref(false);
let marked: Ref<number|undefined> = ref();
let matched: Ref<Array<any>> = ref([]);

const emit = defineEmits(['select']);

const show = async () => {
	showModal.value = true;
	store.connections = await (<any>window).electronAPI.getConnections();

	// wait for modal to render, seemingly needs two ticks
	nextTick(() => {
		nextTick(() => {
			input.value?.focus();
		})
	})
}

const filter = (e: Event) => {
	const input = e.target as HTMLInputElement;
	const cs = store.connections.filter((c) => c.name.indexOf(input.value) != -1);
	const c = cs[0];
	if (c) { marked.value = c.id; }
	matched.value = cs.map(c => c.id);
}

const select = (id: number) => {
	emit('select', id);
	showModal.value = false;
}
// onMounted(() => {
// 	connectionManager.value?.show();
// })

defineExpose({ show });
</script>

<style lang="scss" scoped>
.c-connectionlist {
	&__filter {
		width: 100%;
		padding: 4px 12px;
		border-radius: 3px;
		border: 1px solid #444;
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
		overflow: auto;

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
					border-bottom: 1px solid #eee;
				}
			}
			&:hover {
				background-color: #eee;
			}

			&.hide {
				display: none;
			}
			&.marked {
				background-color: #f1f1f1;
			}
		}
	}

	&__buttons {
		display: flex;
		flex-direction: row;
		gap: 6px;
		width: 100%;
		justify-content: end;
	}
}
</style>