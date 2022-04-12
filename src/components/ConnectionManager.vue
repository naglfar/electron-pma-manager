<template>
	<Modal
   	v-model="showModal"
    	:close="() => showModal = false"
  	>
		<div class="c-cman o-modal">
			<div class="c-cman__connections">
				<div class="c-cman__list">
					<ul>
						<li
							v-for="connection in connections"
							:key="connection.id"
							:class="{
								'selected': selected && selected.id == connection.id,
							}"
							@click="select(connection)"
						>
							{{connection.name}}
						</li>
					</ul>
				</div>
				<div class="c-cman__listbuttons">
					<button class="o-btn" @click.prevent="add">Add</button>
					<button class="o-btn" @click.prevent="remove" :disabled="!selected">Remove</button>
				</div>
			</div>
			<div class="c-cman__edit">
				<form class="c-cman__form" v-if="selected != null">
					<div class="c-cman__fields">
						<div class="c-cman__field">
							<label>Connection name</label>
							<input name="name" v-model="selected.name">
						</div>
						<div class="c-cman__field">
							<label>MySQL User</label>
							<input name="mysql_user" v-model="selected.mysql_user">
						</div>
						<div class="c-cman__field">
							<label>MySQL Password</label>
							<input name="mysql_password" type="password" v-model="selected.mysql_password">
						</div>
						<div class="c-cman__field">
							<label>MySQL Port</label>
							<input name="mysql_port" v-model="selected.mysql_port">
						</div>
						<div class="c-cman__field">
							<label>SSH Host (ssh config)</label>
							<input name="ssh_host" v-model="selected.ssh_host">
						</div>
						<div class="c-cman__field">
							<label for="c-cman__check_favorite">
								Open on start
							</label>
							<input id="c-cman__check_favorite" type="checkbox" name="favorite" v-model="selected.favorite">
						</div>
					</div>
					<button class="o-btn" @click.prevent="save">Save</button>
				</form>
				<div class="c-cman__editbuttons">
					<button class="o-btn" @click.prevent="showModal = false">Close</button>
				</div>
			</div>
		</div>
	</Modal>
</template>

<script setup lang="ts">
import { onMounted, ref, Ref, toRaw, unref } from 'vue';
import { useStore } from '../store';
const store = useStore();

let showModal = ref(false);
const selected:Ref<Connection|undefined> = ref();

let connections:Ref<Array<Connection>> = ref([]);

const fetchConnections = async () => {
	store.connections = await (<any>window).electronAPI.getConnections();
	connections.value = JSON.parse(JSON.stringify(store.connections));
	connections.value.forEach(c => {
		c.favorite = !!c.favorite;
	});
	if (selected.value) {
		selected.value = connections.value.find((c) => c.id = selected.value!.id);
	}
}

const show = async () => {
	showModal.value = true;
	fetchConnections();
	selected.value = undefined;
}

const select = (connection: Connection) => {
	selected.value = connection
}

const add = async() => {
	const newId = connections.value.reduce((id, c) => { return Math.max(id, c.id) }, 0) + 1;
	const c: Connection = {
		'id': newId,
		'name': 'New connection',
	};
	connections.value.push(c);
	selected.value = c;
}

const remove = async() => {
	if (selected.value?.id) {
		await (<any>window).electronAPI.deleteConnection(selected.value.id);
	}
	fetchConnections();
}

const save = async () => {
	const c = toRaw(unref(selected));
	if (c) {
		// c.favorite = c.favorite ? 1 : 0;
		await (<any>window).electronAPI.saveConnection(c);
		await fetchConnections();
	}
}


defineExpose({ show });
</script>

<style lang="scss" scoped>

.c-cman {
	display: flex;
	flex-direction: row;
	align-items: stretch;

	background-color: #f1f1f1;

	width: 90vw;
	height: 90vh;
	max-width: 800px;
	max-height: 600px;

	&__connections {
		flex: 1;
		max-width: 300px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	&__list {
		flex: 1;
		background-color: white;
		border-radius: 3px;
		border: 1px solid #ddd;

		ul {
			padding: 0;
			margin: 0 8px;
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
				&.selected {
					background-color: #f1f1f1;
				}
			}
		}
	}
	&__listbuttons {
		display: flex;
		gap: 8px;

	}

	&__edit {
		flex: 1;
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		gap: 8px;
	}
	&__editbuttons {
		text-align: right;
	}
	&__form {
		display: flex;
		flex-direction: column;
		flex: 1;

		border: 1px solid #bbb;
		padding: 2px 8px 8px;
		border-radius: 3px;

		.o-btn {
			margin-top: 24px;
			align-self: end;
		}
	}

	&__fields {
		// flex: 1;
	}
	&__field {
		display: flex;
		flex-direction: row;
		margin: 6px 0;

		label {
			width: 180px;
		}
		input {
			&:not([type=checkbox]) {
				flex: 1;
			}
			&[type=checkbox] {
				margin-top: 4px;
				margin-left: 4px;
			}
		}

		@media (max-width: 600px) {
			flex-direction: column;
			label {
				padding-left: 1px;
				font-size: 0.8em;
			}
		}
	}

	@media (max-width: 360px) {
		flex-direction: column;
	}

}
</style>