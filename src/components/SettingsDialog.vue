<template>
	<Modal
   	v-model="showModal"
    	:close="() => showModal = false"
  	>
		<div class="c-settings o-modal">
			Settings!
		</div>
	</Modal>
</template>

<script setup lang="ts">
import { onMounted, ref, Ref, toRaw, unref } from 'vue';
import { useStore } from '../store';
const store = useStore();

let showModal = ref(false);

const show = async () => {
	showModal.value = true;
}

defineExpose({ show });
</script>

<style lang="scss" scoped>

</style>