'use strict'

// Small persistent key value store for app internal state (window state, secrets of the php server).
// Same file and format as the former electron-settings package, keys are dotted paths.

const fs = require('fs');
const path = require('path');
const { paths } = require('./paths');

const file = path.join(paths.userData, 'settings.json');
let data = null;

const load = () => {
	if (!data) {
		try {
			data = JSON.parse(fs.readFileSync(file, 'utf8'));
		} catch (e) {
			data = {};
		}
	}
	return data;
};

// written to a temporary file first, a crash never leaves a broken file
const save = () => {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	const tmp = `${file}.tmp`;
	fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
	fs.renameSync(tmp, file);
};

const get = (key) => key.split('.').reduce((value, k) => value?.[k], load());

const set = (key, value) => {
	const keys = key.split('.');
	let target = load();
	for (const k of keys.slice(0, -1)) {
		if (!target[k] || typeof target[k] != 'object') {
			target[k] = {};
		}
		target = target[k];
	}
	target[keys[keys.length - 1]] = value;
	save();
};

module.exports = { get, set };
