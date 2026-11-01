<template>
	<Modal
		v-model="showModal"
		:close="cancel"
	>
		<form class="c-password o-modal" @submit.prevent="submit">
			<label class="c-password__label" for="c-password__input">
				MySQL password for <strong>{{ name }}</strong>
			</label>
			<input
				id="c-password__input"
				ref="input"
				class="c-password__input"
				type="password"
				v-model="password"
				autocomplete="off"
			>
			<small>The password is only kept until the last tab of this connection is closed.</small>
			<div class="c-password__buttons">
				<button type="button" class="o-btn o-btn--secondary" @click="cancel">Cancel</button>
				<button type="submit" class="o-btn">Connect</button>
			</div>
		</form>
	</Modal>
</template>

<script setup lang="ts">
import { nextTick, ref } from 'vue';

const showModal = ref(false);
const name = ref('');
const password = ref('');
const input = ref<HTMLInputElement | null>(null);
let resolvePrompt: ((password: string | null) => void) | null = null;

const finish = (result: string | null) => {
	showModal.value = false;
	password.value = '';
	resolvePrompt?.(result);
	resolvePrompt = null;
};
const submit = () => finish(password.value);
const cancel = () => finish(null);

// resolves with the entered password, null when cancelled
const ask = (connectionName: string): Promise<string | null> => {
	resolvePrompt?.(null);
	name.value = connectionName;
	password.value = '';
	showModal.value = true;
	// wait for the modal to render, as in ConnectionList
	nextTick(() => nextTick(() => input.value?.focus()));
	return new Promise(resolve => resolvePrompt = resolve);
};

defineExpose({ ask });
</script>

<style lang="scss" scoped>
.c-password {
	text-align: left;

	&__input {
		width: 100%;
		padding: 4px 12px;
		border-radius: 3px;
		border: 1px solid var(--c-border-strong);
		font-size: inherit;
		font-family: inherit;
	}

	&__buttons {
		display: flex;
		gap: 6px;
		justify-content: end;
	}
}
</style>
