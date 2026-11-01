'use strict'

// Session and security settings of the phpMyAdmin webviews

const path = require('path');
const { app, session, shell, nativeTheme } = require('electron');
const phpServer = require('./php-server');

// in memory, separate from the ui; Tabs.vue uses the same partition
const PARTITION = 'pma';
const COLOR_SCHEME_HEADER = 'X-PMA-Manager-Color-Scheme';
const CREDENTIALS_HEADER = 'X-PMA-Manager-Credentials';
// permissions phpMyAdmin may use, everything else is denied
const ALLOWED_PERMISSIONS = ['clipboard-sanitized-write'];

// the browser has no token, phpMyAdmin urls are not opened there
const openExternal = (url) => {
	if (/^https?:\/\//.test(url) && !phpServer.isServerUrl(url)) {
		shell.openExternal(url);
	}
};

// web preferences of everything showing phpMyAdmin: webviews and their windows
const pmaWebPreferences = () => ({
	partition: PARTITION,
	preload: path.join(__dirname, 'webview-preload.js'),
	nodeIntegration: false,
	contextIsolation: true,
	sandbox: true,
});

// phpMyAdmin in a webview or a window of its own: links leaving phpMyAdmin
// (documentation, url.php) open in the browser, phpMyAdmin pages open in a new window
// (e.g. print views), which gets the same rules
const restrictPMAContents = (contents) => {
	contents.setWindowOpenHandler(({ url }) => {
		if (phpServer.isServerUrl(url)) {
			return {
				action: 'allow',
				overrideBrowserWindowOptions: {
					// shown when the page is ready, no white flash
					show: false,
					autoHideMenuBar: true,
					icon: path.join(__dirname, 'icon.png'),
					backgroundColor: nativeTheme.shouldUseDarkColors ? '#202124' : '#ffffff',
					webPreferences: pmaWebPreferences(),
				},
			};
		}
		openExternal(url);
		return { action: 'deny' };
	});
	contents.on('did-create-window', (window) => {
		restrictPMAContents(window.webContents);
		window.once('ready-to-show', () => window.show());
	});
	const keepInside = (event, url) => {
		if (!phpServer.isServerUrl(url)) {
			event.preventDefault();
			openExternal(url);
		}
	};
	contents.on('will-navigate', keepInside);
	contents.on('will-redirect', keepInside);
};

// getColorScheme: () => 'light' | 'dark'
// getCredentials: () => { passwords: { [connectionId]: password } of the open connections, controlpass }
const setup = ({ getColorScheme, getCredentials }) => {
	const pmaSession = session.fromPartition(PARTITION);

	// only requests to the php server get the headers, see router.php and config.inc.php
	pmaSession.webRequest.onBeforeSendHeaders(
		{ urls: ['http://localhost/*', 'http://127.0.0.1/*'] },
		(details, callback) => {
			if (phpServer.isServerUrl(details.url)) {
				details.requestHeaders[phpServer.TOKEN_HEADER] = phpServer.token;
				details.requestHeaders[COLOR_SCHEME_HEADER] = getColorScheme();
				details.requestHeaders[CREDENTIALS_HEADER] = Buffer.from(JSON.stringify(getCredentials())).toString('base64');
			}
			callback({ requestHeaders: details.requestHeaders });
		}
	);

	pmaSession.webRequest.onHeadersReceived(
		{ urls: ['http://localhost/*', 'http://127.0.0.1/*'] },
		(details, callback) => {
			if (phpServer.isServerUrl(details.url)) {
				for (const name of Object.keys(details.responseHeaders)) {
					if (name.toLowerCase() == 'x-frame-options') {
						delete details.responseHeaders[name];
					}
				}
			}
			callback({ responseHeaders: details.responseHeaders });
		}
	);

	pmaSession.setPermissionRequestHandler((webContents, permission, callback) => {
		callback(ALLOWED_PERMISSIONS.includes(permission));
	});
	pmaSession.setPermissionCheckHandler((webContents, permission) => ALLOWED_PERMISSIONS.includes(permission));

	app.on('web-contents-created', (event, contents) => {
		// the renderer can't choose preload, partition or urls of webviews
		contents.on('will-attach-webview', (event, webPreferences, params) => {
			delete webPreferences.preloadURL;
			Object.assign(webPreferences, pmaWebPreferences());
			if (params.partition !== PARTITION || !phpServer.isServerUrl(params.src)) {
				console.error('Blocked webview', params.src);
				event.preventDefault();
			}
		});

		contents.on('did-attach-webview', (event, guest) => restrictPMAContents(guest));
	});
};

module.exports = { setup, PARTITION };
