<template>
 	<webview :src="src" v-if="store.activeTab" />
</template>
<script setup lang="ts">
import { useStore } from '../store';
const store = useStore();
let src = "";
if (store.activeTab) {
	src = 'http://localhost:5555/pma/?server=1';
}

</script>