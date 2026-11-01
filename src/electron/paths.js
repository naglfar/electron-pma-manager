'use strict'

// Must be required before anything calls app.getPath('userData') (knexfile, electron-settings).

const fs = require('fs');
const path = require('path');
const os = require('os');
const { app } = require('electron');

const APP_DIR = 'electron-pma-manager';
const LEGACY_APP_DIR = 'pma-electron-vue';

if (process.platform === 'linux') {
	const dataHome = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
	const cacheHome = process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache');
	app.setPath('userData', path.join(dataHome, APP_DIR));
	// chromium caches, local storage etc.
	app.setPath('sessionData', path.join(cacheHome, APP_DIR));
}

const userData = app.getPath('userData');

const paths = {
	userData,
	db: path.join(userData, 'db.sqlite'),
	pma: path.join(userData, 'phpMyAdmin'),
	pmaTmp: path.join(app.getPath('sessionData'), 'pma-tmp'),
};

// copy data of the old app name, the legacy directory is left untouched
const migrateLegacyData = () => {
	const legacyDir = path.join(app.getPath('appData'), LEGACY_APP_DIR);
	if (!fs.existsSync(legacyDir) || fs.existsSync(paths.db)) {
		return;
	}
	fs.mkdirSync(userData, { recursive: true });
	['db.sqlite', 'settings.json'].forEach((file) => {
		const src = path.join(legacyDir, file);
		const dst = path.join(userData, file);
		if (fs.existsSync(src) && !fs.existsSync(dst)) {
			fs.copyFileSync(src, dst);
		}
	});
};

module.exports = { paths, migrateLegacyData };
