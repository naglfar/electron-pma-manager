<template>
	<input ref="input" type="search" class="filter" @input="filter" @keypress.enter="() => marked && select(marked)">
 	<ul>
		 <li
		 	v-for="connection in connections"
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
</template>
<script setup lang="ts">
import { defineEmits, nextTick, ref, Ref } from 'vue';
import { useStore } from '../store';
const store = useStore();
const connections = store.connections;
const input = ref<HTMLInputElement | null>(null);
let marked: Ref<number|null> = ref(null);
let matched: Ref<Array<any>> = ref([]);

const emit = defineEmits(['select']);

const focus = () => {
	input.value?.focus();
};

const filter = (e) => {
	const cs = connections.filter((c) => c.name.indexOf(e.target.value) != -1);
	const c = cs[0];
	if (c) { marked.value = c.id; }
	matched.value = cs.map(c => c.id);
}

const select = (id: number) => {
	emit('select', id);
}
defineExpose({ focus });
</script>

<style lang="scss" scoped>
input.filter {
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
			background-color: #eee;
		}
	}
}
</style>