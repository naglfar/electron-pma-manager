'use strict'

// Runs test/electron/*.test.cjs in the electron main process: `electron test/electron/runner.cjs`.
// Data goes to a temporary directory, windows are created hidden by the tests.

const fs = require('fs');
const os = require('os');
const path = require('path');

// before any module of the app reads its paths, see src/electron/paths.js
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pma-electron-test-'));
process.env.XDG_DATA_HOME = path.join(tmp, 'data');
process.env.XDG_CACHE_HOME = path.join(tmp, 'cache');
process.env.XDG_CONFIG_HOME = path.join(tmp, 'config');

const { app } = require('electron');
const { run } = require('node:test');
const { spec } = require('node:test/reporters');

// a fixed test key instead of the keychain (no password manager prompts)
app.commandLine.appendSwitch('password-store', 'basic');
app.on('window-all-closed', () => {});

app.whenReady().then(() => {
	const filter = process.argv.slice(2).find(arg => !arg.startsWith('-'));
	const files = fs.readdirSync(__dirname)
		.filter(f => f.endsWith('.test.cjs') && (!filter || f.includes(filter)))
		.map(f => path.join(__dirname, f));
	let failed = false;
	const stream = run({ files, isolation: 'none', concurrency: false });
	stream.on('test:fail', () => failed = true);

	// in the same process node:test finishes on 'beforeExit', which electron never emits:
	// emit it once all top level tests completed and nothing new started for a moment
	let enqueued = 0;
	let completed = 0;
	let idle = null;
	stream.on('test:enqueue', (data) => {
		if (data.nesting == 0) enqueued++;
		clearTimeout(idle);
	});
	stream.on('test:complete', (data) => {
		if (data.nesting == 0) completed++;
		clearTimeout(idle);
		if (completed && completed == enqueued) {
			idle = setTimeout(() => process.emit('beforeExit', 0), 300);
		}
	});

	const output = stream.compose(spec);
	output.pipe(process.stdout);
	output.on('end', () => {
		fs.rmSync(tmp, { recursive: true, force: true });
		app.exit(failed ? 1 : 0);
	});
});
