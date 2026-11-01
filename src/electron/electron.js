'use strict'

const path = require('path');
const { app, BrowserWindow, ipcMain, dialog, screen, Notification, nativeTheme } = require('electron')
const { paths, migrateLegacyData } = require('./paths');
const pma = require('./pma');
const phpServer = require('./php-server');
const { TunnelManager } = require('./tunnels');
const pmaSession = require('./pma-session');
const secrets = require('./secrets');
const appState = require('./app-state');
const knex = require('knex');

const isDevelopment = process.env.NODE_ENV === 'dev';

const dbConfig = require('./database/knexfile.js');
let dbInstance;

let settings = {};
let pmaOptions = {};
let tunnelManager;
let mainWindow;
// mysql passwords of the open connections, plain text only in memory, see pma-session.js
const connectionPasswords = new Map();
// decrypted control user password, the request headers are set synchronously
let controlPassword = '';

// columns the renderer may save
const CONNECTION_COLUMNS = ['id', 'name', 'mysql_user', 'mysql_password', 'mysql_password_ask', 'mysql_host', 'mysql_port', 'ssh_host', 'favorite'];

const getPHPPort = () => parseInt(settings.startingport, 10) || 4406;

// 'system' follows the os, the renderer gets it as prefers-color-scheme
const applyUITheme = (theme) => {
	nativeTheme.themeSource = ['light', 'dark'].includes(theme) ? theme : 'system';
};
// phpMyAdmin renders its theme on the server, config.inc.php picks the light or dark one, see pma-session.js
const colorScheme = () => nativeTheme.shouldUseDarkColors ? 'dark' : 'light';

// tabs pick up a changed phpMyAdmin theme when they reload,
// reloadActive: also the visible tab, for changes made in the settings
const notifyPMAThemeChanged = (reloadActive) => {
	if (mainWindow && !mainWindow.isDestroyed()) {
		mainWindow.webContents.send('pma-theme-changed', { reloadActive });
	}
};

let lastColorScheme;
nativeTheme.on('updated', () => {
	if (colorScheme() != lastColorScheme) {
		lastColorScheme = colorScheme();
		notifyPMAThemeChanged(false);
	}
});

// avoids a white flash before the ui is rendered
const windowBackground = () => nativeTheme.shouldUseDarkColors ? '#202124' : '#ffffff';

const windowStateKeeper = async (windowName) => {
	let window, windowState;

	const setBounds = async () => {
		 // Restore from appConfig
		 if (appState.get(`windowState.${windowName}`)) {
			  windowState = appState.get(`windowState.${windowName}`);
			  return;
		 }

		 const size = screen.getPrimaryDisplay().workAreaSize;

		 // Default
		 windowState = {
			  x: undefined,
			  y: undefined,
			  width: size.width / 2,
			  height: size.height / 2,
		 };
	};

	const saveState = async () => {
		 if (!windowState.isMaximized) {
			  windowState = window.getBounds();
		 }
		 windowState.isMaximized = window.isMaximized();
		 appState.set(`windowState.${windowName}`, windowState);
	};

	// resizing and moving fire many events, save once they stop
	let saveTimer = null;
	const saveStateDebounced = () => {
		 clearTimeout(saveTimer);
		 saveTimer = setTimeout(saveState, 500);
	};

	const track = async (win) => {
		 window = win;
		 ['resize', 'move'].forEach((event) => {
			  win.on(event, saveStateDebounced);
		 });
		 win.on('close', () => {
			  clearTimeout(saveTimer);
			  saveState();
		 });
	};

	await setBounds();

	return {
		 x: windowState.x,
		 y: windowState.y,
		 width: windowState.width,
		 height: windowState.height,
		 isMaximized: windowState.isMaximized,
		 track,
	};
};
let mainWindowStateKeeper;

async function createMainWindow() {

	mainWindowStateKeeper = await windowStateKeeper('main');

	const win = new BrowserWindow({
		icon: `${__dirname}/icon.png`,
		backgroundColor: windowBackground(),
		fullscreen: false,
		autoHideMenuBar: true,

		x: mainWindowStateKeeper.x,
		y: mainWindowStateKeeper.y,
		width: mainWindowStateKeeper.width,
		height: mainWindowStateKeeper.height,

		webPreferences: {
			preload: path.join(__dirname, 'electron-preload.js'),
			webviewTag: true,
		},
	});
	if (mainWindowStateKeeper.isMaximized) {
		win.maximize();
	}
	mainWindowStateKeeper.track(win);

	// a reload of the ui closes all tabs
	win.webContents.on('did-navigate', () => {
		connectionPasswords.clear();
		tunnelManager.closeAll();
	});
	mainWindow = win;
	// also closes the windows phpMyAdmin opened, see pma-session.js
	win.on('closed', quit);

	if (isDevelopment) {
		// set by scripts/dev.mjs
		win.loadURL(process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:3000/');
	} else {
		win.loadFile(path.normalize(`${__dirname}/../../dist/index.html`));
	}
}

const registerIPC = () => {
	ipcMain.on('set-title', (event, title) => {
		BrowserWindow.fromWebContents(event.sender)?.setTitle(title);
	});

	// whether opening the connection needs a password from the user
	ipcMain.handle('connection-needs-password', async (event, connectionId) => {
		const row = await dbInstance.table('connections').where({ id: connectionId }).first();
		return !!row?.mysql_password_ask && !connectionPasswords.has(connectionId);
	});

	// the entered password was rejected by mysql, the next new-connection needs a new one
	ipcMain.handle('forget-password', async (event, connectionId) => {
		const row = await dbInstance.table('connections').where({ id: connectionId }).first();
		if (row?.mysql_password_ask) {
			connectionPasswords.delete(connectionId);
		}
	});

	// opens the tunnel if necessary, returns the phpMyAdmin server index
	// password: entered by the user for "ask on connect" connections
	ipcMain.handle('new-connection', async (event, { id }, password) => {
		const connection = await dbInstance.table('connections').where({ id }).first();
		const hadPassword = connectionPasswords.has(id);
		try {
			if (!connection) {
				throw new Error(`Connection ${id} not found`);
			}
			if (!hadPassword) {
				if (connection.mysql_password_ask && typeof password != 'string') {
					throw new Error('A password is required');
				}
				connectionPasswords.set(id, connection.mysql_password_ask ? password : await secrets.decrypt(connection.mysql_password));
			}
			await tunnelManager.open(connection);
			return connection.id;
		} catch (err) {
			if (!hadPassword) {
				connectionPasswords.delete(id);
			}
			dialog.showMessageBox(BrowserWindow.fromWebContents(event.sender), {
				type: 'error',
				title: 'Connection failed',
				message: `Could not open connection "${connection?.name ?? id}"`,
				detail: err.message,
			});
			throw err;
		}
	});

	// last tab of a connection was closed
	ipcMain.handle('close-connection', async (event, connectionId) => {
		connectionPasswords.delete(connectionId);
		await tunnelManager.close(connectionId);
	});

	ipcMain.handle('save-connection', async (event, data) => {
		const connection = Object.fromEntries(CONNECTION_COLUMNS.filter(key => key in data).map(key => [key, data[key]]));
		// a changed host or port needs a new tunnel
		const old = await dbInstance.table('connections').where({ id: connection.id }).first();
		if (old && ['ssh_host', 'mysql_host', 'mysql_port'].some(key => (old[key] || '') != (connection[key] || ''))) {
			connectionPasswords.delete(connection.id);
			await tunnelManager.close(connection.id);
		}
		// convert boolean to sqlite integer
		connection.favorite = connection.favorite ? 1 : 0;
		connection.mysql_password_ask = connection.mysql_password_ask ? 1 : 0;
		if (connection.mysql_password_ask) {
			connection.mysql_password = '';
		} else if (!connection.mysql_password && old?.mysql_password && !await secrets.canDecrypt(old.mysql_password)) {
			// not decryptable right now (e.g. locked keychain), the dialog showed it empty: keep it
			connection.mysql_password = old.mysql_password;
		} else if (connectionPasswords.has(connection.id)) {
			// open tabs use the new password on the next request
			connectionPasswords.set(connection.id, connection.mysql_password || '');
		}
		if (!secrets.isEncrypted(connection.mysql_password)) {
			connection.mysql_password = await secrets.encrypt(connection.mysql_password);
		}
		return await dbInstance.table('connections').insert(connection).onConflict('id').merge();
	});

	ipcMain.handle('delete-connection', async (event, connectionId) => {
		connectionPasswords.delete(connectionId);
		await tunnelManager.close(connectionId);
		return await dbInstance.table('connections').where({'id': connectionId}).del();
	});

	ipcMain.handle('get-connections', async () => {
		const connections = await dbInstance.table('connections').select('*').orderBy('name');
		for (const c of connections) {
			// convert sqlite integer fields to boolean
			c.favorite = !!c.favorite;
			c.mysql_password_ask = !!c.mysql_password_ask;
			c.mysql_password = await secrets.decrypt(c.mysql_password);
		}
		return connections;
	});

	// controlpass is stored encrypted
	ipcMain.handle('get-settings', () => {
		return { ...settings, ...(settings.controlpass ? { controlpass: controlPassword } : {}) };
	});
	// preview while the settings dialog is open, saved with the settings
	ipcMain.handle('set-ui-theme', (event, theme) => {
		applyUITheme(theme);
	});

	ipcMain.handle('save-settings', async (event, s) => {
		const themeChanged = ['uitheme', 'theme', 'themedark'].some(key => settings[key] != s[key]);
		const oldPort = getPHPPort();
		if (!s.controlpass && settings.controlpass && !await secrets.canDecrypt(settings.controlpass)) {
			// not decryptable right now (e.g. locked keychain), the dialog showed it empty: keep it
			s = { ...s, controlpass: settings.controlpass };
		} else {
			controlPassword = s.controlpass || '';
		}
		settings = { ...s, ...(s.controlpass && !secrets.isEncrypted(s.controlpass) ? { controlpass: await secrets.encrypt(s.controlpass) } : {}) };
		applyUITheme(settings.uitheme);
		if (themeChanged) {
			notifyPMAThemeChanged(true);
		}
		if (getPHPPort() != oldPort && !await movePHPServer(oldPort)) {
			settings.startingport = String(oldPort);
		}
		const query = dbInstance.table('settings');
		const keys = [];
		for (let [key, value] of Object.entries(settings)) {
			keys.push(key);
			await query.clone().insert({ 'key': key, 'value': value }).onConflict('key').merge();
		}
		await query.clone().del().whereNotIn('key', keys);
	});

	// fresh, themes may have been installed in the background
	ipcMain.handle('get-pmaoptions', async () => {
		pmaOptions = await phpServer.getPMAOptions();
		return pmaOptions;
	});

	ipcMain.handle('get-pma-url', () => {
		return phpServer.getUrl();
	});

	ipcMain.handle('pma-check-update', async () => {
		return await pma.checkUpdate();
	});

	ipcMain.handle('pma-update', async (event, version) => {
		const win = BrowserWindow.fromWebContents(event.sender);
		const onProgress = (step, progress) => {
			win.setProgressBar(progress);
			win.webContents.send('pma-update-progress', { step, progress });
		};
		try {
			await pma.install(version, onProgress, () => phpServer.stop());
		} finally {
			win.setProgressBar(-1);
			if (!phpServer.isRunning()) {
				await phpServer.start(getPHPPort());
			}
		}
		pmaOptions = await phpServer.getPMAOptions();
		return pmaOptions;
	});
};

// asks to trust an unknown ssh host key, warns about changed / revoked ones
const confirmHostKey = async (info) => {
	const parent = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
	const keyInfo = `${info.type} key fingerprint is ${info.fingerprint}.`;
	if (info.status == 'unknown') {
		const known = info.knownTypes.length ? `\n\nKnown key types for this host: ${info.knownTypes.join(', ')}.` : '';
		const { response } = await dialog.showMessageBox(parent, {
			type: 'question',
			title: 'Unknown SSH host',
			message: `The authenticity of host ${info.host} can't be established.`,
			detail: `${keyInfo}${known}\n\nConnecting adds the key to your known_hosts file.`,
			buttons: ['Connect', 'Cancel'],
			defaultId: 1,
			cancelId: 1,
		});
		return response == 0;
	}
	await dialog.showMessageBox(parent, {
		type: 'error',
		title: 'SSH host key verification failed',
		message: info.status == 'changed'
			? `The host key of ${info.host} has changed!`
			: `The host key of ${info.host} is revoked!`,
		detail: `${keyInfo}\n\nSomeone could be eavesdropping on you (man-in-the-middle attack), or the host key has just been changed. `
			+ `If the change is expected, remove the old key with:\n\nssh-keygen -R '${info.host}'`,
	});
	return false;
};

// changed starting port: restart the php server there, the tabs follow (pma-url-changed),
// open tunnels keep their ports. Returns false and stays on the old port if the new one fails.
const movePHPServer = async (oldPort) => {
	await phpServer.stop();
	let moved = true;
	try {
		await phpServer.start(getPHPPort());
	} catch (err) {
		moved = false;
		dialog.showMessageBox(mainWindow, {
			type: 'error',
			title: 'Port not changed',
			message: `phpMyAdmin can't use port ${getPHPPort()}, it stays on port ${oldPort}.`,
			detail: err.message,
		});
		await phpServer.start(oldPort);
	}
	mainWindow?.webContents.send('pma-url-changed', phpServer.getUrl());
	return moved;
};

// plain text passwords of older versions, or encrypted with an outdated key
const reEncrypt = async (value) => {
	if (secrets.isEncrypted(value)) {
		return await secrets.needsReEncrypt(value) ? await secrets.encrypt(await secrets.decrypt(value)) : value;
	}
	return await secrets.encrypt(value);
};
const encryptStoredPasswords = async () => {
	let changed = false;
	const controlpass = await dbInstance.table('settings').where({ key: 'controlpass' }).first();
	if (controlpass?.value) {
		const encrypted = await reEncrypt(controlpass.value);
		if (encrypted != controlpass.value) {
			await dbInstance.table('settings').where({ key: 'controlpass' }).update({ value: encrypted });
			changed = true;
		}
	}
	const connections = await dbInstance.table('connections').select('id', 'mysql_password');
	for (const c of connections) {
		const encrypted = await reEncrypt(c.mysql_password);
		if (encrypted != c.mysql_password) {
			await dbInstance.table('connections').where({ id: c.id }).update({ mysql_password: encrypted });
			changed = true;
		}
	}
	// rewrites the file, sqlite keeps old values in free pages
	if (changed) {
		await dbInstance.raw('VACUUM');
	}
};

let quitting = false;
const quit = async () => {
	if (quitting) return;
	quitting = true;
	try {
		await tunnelManager?.closeAll();
		await phpServer.stop();
		await dbInstance?.destroy();
	} catch(e) {
		console.error(e);
	}
	app.quit();
};

// small window showing the progress of the first phpMyAdmin installation
const createProgressWindow = async (title) => {
	const win = new BrowserWindow({
		width: 420,
		height: 120,
		title,
		resizable: false,
		minimizable: false,
		maximizable: false,
		autoHideMenuBar: true,
		icon: `${__dirname}/icon.png`,
		backgroundColor: windowBackground(),
	});
	const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light dark"><title>${title}</title></head>
		<body style="font-family: sans-serif; margin: 16px;">
			<div id="step">&nbsp;</div>
			<progress id="progress" max="1" value="0" style="width: 100%; margin-top: 12px;"></progress>
		</body></html>`;
	await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
	return {
		update: (step, progress) => {
			if (win.isDestroyed()) return;
			win.setProgressBar(progress);
			win.webContents.executeJavaScript(
				`document.getElementById('step').textContent = ${JSON.stringify(`${step}…`)};
				document.getElementById('progress').value = ${Number(progress) || 0};`
			).catch(() => {});
		},
		close: () => !win.isDestroyed() && win.destroy(),
	};
};

const installPMA = async () => {
	let progressWindow;
	try {
		const release = await pma.getLatestRelease();
		const btn = dialog.showMessageBoxSync({
			type: 'question',
			title: 'No phpMyAdmin installed',
			message: `Downloading phpMyAdmin ${release.version} to ${paths.pma}, this can take a short while.`,
			buttons: [
				'OK',
				'Cancel',
			],
			cancelId: 1,
		});
		if (btn != 0) {
			return { installed: false };
		}
		progressWindow = await createProgressWindow(`Installing phpMyAdmin ${release.version}`);
		await pma.install(release.version, progressWindow.update);
		return { installed: true, progressWindow };
	} catch (e) {
		progressWindow?.close();
		dialog.showErrorBox('Error installing phpMyAdmin', e.stack || String(e));
		return { installed: false };
	}
};

// non blocking hint at startup
const notifyPMAUpdate = async () => {
	try {
		const info = await pma.checkUpdate();
		if (info.updateAvailable && Notification.isSupported()) {
			new Notification({
				title: 'phpMyAdmin update available',
				body: `phpMyAdmin ${info.latest} is available (installed: ${info.installed}). Update it in the settings.`,
				icon: `${__dirname}/icon.png`,
			}).show();
		}
	} catch (e) {
		// offline: no hint
	}
};

// Quit when all windows are closed.
app.on('window-all-closed', quit);

app.on('ready', async () => {

	if (process.platform === 'win32') {
		process.on('message', (data) => {
			if (data === 'graceful-exit') {
				quit();
			}
		})
	} else {
		process.on('SIGINT', quit);
		process.on('SIGTERM', quit);
	}

	if (!phpServer.hasPHP()) {
		dialog.showErrorBox('PHP missing', `PHP is required to be installed and in your PATH for this.`);
		return quit();
	}

	migrateLegacyData();

	dbInstance = knex(dbConfig);
	try {
		await dbInstance.migrate.latest();
		await encryptStoredPasswords();
		console.log(`Password storage: ${secrets.backend()}${secrets.isWeak() ? ' (no keychain, weak encryption)' : ''}`);
	} catch(err) {
		dialog.showErrorBox('DB Error', `Your database seems to be broken:\n\n${err.stack}`);
		return quit();
	}

	const settingsRows = await dbInstance.table('settings');
	settingsRows.forEach((s) => {
		settings[s.key] = s.value;
	});
	controlPassword = await secrets.decrypt(settings.controlpass);

	applyUITheme(settings.uitheme);
	lastColorScheme = colorScheme();

	tunnelManager = new TunnelManager(dbInstance, () => getPHPPort() + 1, { onHostKey: confirmHostKey });
	await tunnelManager.reset();

	let progressWindow;
	if (!pma.isInstalled()) {
		const result = await installPMA();
		if (!result.installed) {
			return quit();
		}
		progressWindow = result.progressWindow;
	}

	// update pma extensions if changed
	pma.updateExtensions();
	// e.g. installations from older versions, runs in the background
	pma.installThemes();

	try {
		await phpServer.start(getPHPPort());
	} catch (err) {
		progressWindow?.close();
		dialog.showErrorBox('Error starting PHP', err.message);
		return quit();
	}

	pmaOptions = await phpServer.getPMAOptions();

	pmaSession.setup({
		getColorScheme: colorScheme,
		getCredentials: () => ({
			passwords: Object.fromEntries(connectionPasswords),
			controlpass: controlPassword,
		}),
	});
	registerIPC();
	await createMainWindow();
	progressWindow?.close();

	notifyPMAUpdate();
});