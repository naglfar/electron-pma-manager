<template>
	<Modal
   	v-model="showModal"
    	:close="close"
  	>
		<div class="c-settings o-modal o-modal--nopadding">
			   <Tabs :options="{ useUrlFragment: false }">
					<Tab name="General">
						<div class="c-settings__field">
							<label>Starting port</label><input v-model="settings.startingport" type="number" placeholder="4406">
						</div>
						<small style="position:relative; top:-6px;">First port is being used for the php server, subsequent ports will be used for ssh tunnels. Takes full effect after restart.</small>
						<div class="c-settings__field">
							<label>UI Theme</label>
							<select>
								<option>Light</option>
								<option>Dark</option>
							</select>
						</div>
					</Tab>
					<Tab name="phpMyAdmin">
						<div class="c-settings__field">
							<label>Theme</label>
							<select v-model="settings.theme">
								<option
									v-for="theme in store.pmaOptions.get('themes')"
									:key="theme.key"
									:value="theme.key == 'pmahomme' && !settings.theme ? settings.theme : theme.key"
									v-html="theme.label" />
							</select>
						</div>
						<div class="c-settings__field">
							<label>Language</label>
							<select v-model="settings.language">
								<option
									v-for="language in store.pmaOptions.get('languages')"
									:key="language.key"
									:value="language.key == 'en' && !settings.language ? settings.language : language.key"
									v-html="language.label" />
							</select>
						</div>
						<div class="c-settings__field">
							<label>Control host</label>
							<div class="c-settings__field"><label class="c-settings__checkboxlabel"><input type="checkbox" v-model="settings.usecontrol"> Use <small>(for phpMyAdmins extended features)</small></label></div>
						</div>
						<div class="c-settings__field c-settings__field--level2"><label>Host</label><input :disabled="!settings.usecontrol" v-model="settings.controlhost" placeholder="localhost"></div>
						<div class="c-settings__field c-settings__field--level2"><label>Port</label><input :disabled="!settings.usecontrol" v-model="settings.controlport" placeholder="3306"></div>
						<div class="c-settings__field c-settings__field--level2"><label>User</label><input :disabled="!settings.usecontrol" v-model="settings.controluser" placeholder="root"></div>
						<div class="c-settings__field c-settings__field--level2"><label>Password</label><input :disabled="!settings.usecontrol" v-model="settings.controlpass" placeholder="none"></div>
						<div class="c-settings__field c-settings__field--level2"><label>Database</label><input :disabled="!settings.usecontrol" v-model="settings.pmadb " placeholder="pma"></div>
					</Tab>
				</Tabs>
				<div class="c-settings__buttons">
					<button class="o-btn" @click.prevent="close">Close</button>
				</div>
		</div>
	</Modal>
</template>

<script setup lang="ts">
import { onMounted, ref, Ref, toRaw, unref } from 'vue';
// @ts-ignore
import {Tabs, Tab} from 'vue3-tabs-component';
import { useStore } from '../store';
const store = useStore();

const settings = ref(Object.fromEntries(store.settings));
settings.value.usecontrol = !!settings.value.usecontrol;

let showModal = ref(false);

const show = async () => {
	showModal.value = true;
}
const close = () => {
	store.settings = new Map(Object.entries(settings.value));
	store.saveSettings();
	showModal.value = false;
}

defineExpose({ show });
</script>

<style lang="scss" scoped>

.c-settings {

	width: 90vw;
	height: 90vh;
	max-width: 800px;
	max-height: 600px;

	display: flex;
	flex-direction: column;

	.tabs-component {
		flex: 1;
	}

	&__field {
		display: flex;
		margin-bottom: 6px;

		label {
			width: 180px;


			&.c-settings__checkboxlabel {
				width: auto;
			}
		}
		input, select {
			max-width: 180px;
			&:not([type=checkbox]) {
				flex: 1;
			}
			&[type=checkbox] {
				margin-top: 4px;
				margin-left: 4px;
			}
		}

		&--level2 {
			padding-left: 48px;
			label {
				width: calc(180px - 48px);
			}
		}

	}

	&__buttons {
		display: flex;
		justify-content: flex-end;
		padding: 16px;
	}
}
</style>