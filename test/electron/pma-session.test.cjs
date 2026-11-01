'use strict'

// php server with router.php and the session of the phpMyAdmin webviews

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const net = require('net');
const { BrowserWindow, shell } = require('electron');
const { paths } = require('../../src/electron/paths');
const phpServer = require('../../src/electron/php-server');
const pmaSession = require('../../src/electron/pma-session');
const fakePMA = require('../helpers/fake-pma.cjs');

const wait = ms => new Promise(r => setTimeout(r, ms));
const freePort = () => new Promise(resolve => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const get = (port, urlPath, headers = {}) => new Promise((resolve, reject) => {
	http.get({ host: '127.0.0.1', port, path: urlPath, headers }, res => {
		let body = '';
		res.on('data', d => body += d);
		res.on('end', () => resolve({ status: res.statusCode, body }));
	}).on('error', reject);
});

let port;
const opened = [];
// windows phpMyAdmin opens are never shown in tests
const shown = [];
const originalShow = BrowserWindow.prototype.show;
const originalOpenExternal = shell.openExternal;

before(async () => {
	fakePMA.create(paths.pma);
	port = await freePort();
	await phpServer.start(port);
	BrowserWindow.prototype.show = function () { shown.push(this.webContents.getURL()); };
	shell.openExternal = async url => { opened.push(url); };
	pmaSession.setup({
		getColorScheme: () => 'dark',
		getCredentials: () => ({ passwords: { 7: 'secret' }, controlpass: '' }),
	});
});
after(async () => {
	BrowserWindow.prototype.show = originalShow;
	shell.openExternal = originalOpenExternal;
	BrowserWindow.getAllWindows().forEach(w => w.destroy());
	await phpServer.stop();
});

test('php server: only requests with the token of this run', async () => {
	assert.ok(phpServer.isRunning());
	assert.strictEqual(phpServer.getUrl(), `http://localhost:${port}`);
	for (const urlPath of ['/', '/index.php', '/style.css', '/setup/index.php', '/pmadata.php']) {
		assert.strictEqual((await get(port, urlPath)).status, 403, `${urlPath} without token`);
		assert.strictEqual((await get(port, urlPath, { [phpServer.TOKEN_HEADER]: 'wrong' })).status, 403, `${urlPath} with a wrong token`);
		assert.strictEqual((await get(port, urlPath, { [phpServer.TOKEN_HEADER]: phpServer.token })).status, 200, `${urlPath} with the token`);
	}
	assert.deepStrictEqual(await phpServer.getPMAOptions(), { languages: [{ key: 'en', label: 'English' }], themes: [] });
});

test('php server: urls of this server', () => {
	assert.ok(phpServer.isServerUrl(`http://localhost:${port}/index.php`));
	assert.ok(phpServer.isServerUrl(`http://127.0.0.1:${port}/`));
	assert.ok(!phpServer.isServerUrl(`http://localhost:${port + 1}/`));
	assert.ok(!phpServer.isServerUrl(`https://localhost:${port}/`));
	assert.ok(!phpServer.isServerUrl('https://example.com/'));
	assert.ok(!phpServer.isServerUrl('not a url'));
});

test('php server: moving to another port', async () => {
	const blocker = net.createServer();
	const blocked = await freePort();
	await new Promise(r => blocker.listen(blocked, '127.0.0.1', r));
	await phpServer.stop();
	await assert.rejects(phpServer.start(blocked), /already in use/);
	blocker.close();
	await phpServer.start(port);
	assert.strictEqual((await get(port, '/', { [phpServer.TOKEN_HEADER]: phpServer.token })).status, 200);
});

test('webviews: settings forced by the main process, headers only for the php server', async () => {
	const win = new BrowserWindow({ show: false, webPreferences: { webviewTag: true } });
	const attached = [];
	win.webContents.on('did-attach-webview', (e, guest) => attached.push(guest));
	const url = phpServer.getUrl();
	await win.loadURL('data:text/html,' + encodeURIComponent(`<body>
		<webview partition="pma" allowpopups src="${url}/index.php" preload="file:///etc/passwd"></webview>
		<webview src="${url}/index.php"></webview>
		<webview partition="pma" src="https://example.com/"></webview>
	</body>`));
	for (let i = 0; i < 50 && !attached.length; i++) await wait(100);
	await wait(1500);

	assert.strictEqual(attached.length, 1, 'wrong partition and foreign urls are blocked');
	const guest = attached[0];
	const prefs = guest.getLastWebPreferences();
	assert.deepStrictEqual([prefs.sandbox, prefs.contextIsolation, prefs.nodeIntegration], [true, true, false]);

	const info = JSON.parse(await guest.executeJavaScript(`document.getElementById('info').textContent`));
	assert.strictEqual(info.colorScheme, 'dark');
	assert.deepStrictEqual(info.credentials, { passwords: { 7: 'secret' }, controlpass: '' });
	assert.strictEqual(info.db, paths.db);

	// links leaving phpMyAdmin go to the browser, phpMyAdmin pages to a window of their own
	await guest.executeJavaScript(`window.open('https://example.org/docs'); window.open('${url}/setup/index.php'); true`, true);
	await wait(1500);
	const before = guest.getURL();
	await guest.executeJavaScript(`location.href = 'https://example.net/'; true`, true).catch(() => {});
	await wait(500);
	assert.strictEqual(guest.getURL(), before, 'navigation stays inside phpMyAdmin');
	assert.deepStrictEqual(opened, ['https://example.org/docs', 'https://example.net/']);
	assert.deepStrictEqual(shown, [`${url}/setup/index.php`], 'phpMyAdmin popup in a window (hidden in tests)');
	win.destroy();
});
