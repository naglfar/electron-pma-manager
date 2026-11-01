'use strict'

// Session and security settings of the phpMyAdmin webviews

const path = require('path');
const { app, session, shell } = require('electron');
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
			webPreferences.preload = path.join(__dirname, 'webview-preload.js');
			webPreferences.nodeIntegration = false;
			webPreferences.contextIsolation = true;
			webPreferences.sandbox = true;
			if (params.partition !== PARTITION || !phpServer.isServerUrl(params.src)) {
				console.error('Blocked webview', params.src);
				event.preventDefault();
			}
		});

		// links leaving phpMyAdmin (documentation, url.php) open in the browser,
		// new windows are never created (the webviews allow popups only to get here)
		contents.on('did-attach-webview', (event, guest) => {
			guest.setWindowOpenHandler(({ url }) => {
				openExternal(url);
				return { action: 'deny' };
			});
			const keepInside = (event, url) => {
				if (!phpServer.isServerUrl(url)) {
					event.preventDefault();
					openExternal(url);
				}
			};
			guest.on('will-navigate', keepInside);
			guest.on('will-redirect', keepInside);
		});
	});
};

module.exports = { setup, PARTITION };
