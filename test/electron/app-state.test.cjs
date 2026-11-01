'use strict'

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { paths } = require('../../src/electron/paths');
const appState = require('../../src/electron/app-state');

test('dotted keys, stored in settings.json', () => {
	assert.strictEqual(appState.get('windowState.main'), undefined);
	appState.set('windowState.main', { width: 800, height: 600 });
	appState.set('windowState.main.isMaximized', true);
	appState.set('pmaSecret', 'abc');
	assert.deepStrictEqual(appState.get('windowState.main'), { width: 800, height: 600, isMaximized: true });

	const file = path.join(paths.userData, 'settings.json');
	assert.deepStrictEqual(JSON.parse(fs.readFileSync(file, 'utf8')), {
		windowState: { main: { width: 800, height: 600, isMaximized: true } },
		pmaSecret: 'abc',
	});
	assert.strictEqual(fs.statSync(file).mode & 0o777, 0o600);
	assert.ok(!fs.existsSync(`${file}.tmp`));
});
