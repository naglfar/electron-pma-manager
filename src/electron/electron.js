'use strict'

const path = require('path');
const { app, BrowserWindow, ipcMain, dialog, screen, Notification } = require('electron')
const { paths, migrateLegacyData } = require('./paths');
const pma = require('./pma');
const phpServer = require('./php-server');
const { TunnelManager } = require('./tunnels');
const electronSettings = require('electron-settings');
const knex = require('knex');

const isDevelopment = process.env.NODE_ENV === 'dev';

const dbConfig = require('./database/knexfile.js');
let dbInstance;

let settings = {};
let pmaOptions = {};
let tunnelManager;

const getPHPPort = () => parseInt(settings.startingport, 10) || 4406;

const windowStateKeeper = async (windowName) => {
	let window, windowState;

	const setBounds = async () => {
		 // Restore from appConfig
		 if (await electronSettings.has(`windowState.${windowName}`)) {
			  windowState = await electronSettings.get(`windowState.${windowName}`);
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
		 // bug: lots of save state events are called. they should be debounced
		 if (!windowState.isMaximized) {
			  windowState = window.getBounds();
		 }
		 windowState.isMaximized = window.isMaximized();
		 await electronSettings.set(`windowState.${windowName}`, windowState);
	};

	const track = async (win) => {
		 window = win;
		 ['resize', 'move', 'close'].forEach((event) => {
			  win.on(event, saveState);
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
	win.webContents.on('did-navigate', () => tunnelManager.closeAll());

	win.webContents.session.webRequest.onHeadersReceived(
		{ urls: [ "*://*/*" ] },
		(d, c) => {
			if (d.responseHeaders['X-Frame-Options']){
				delete d.responseHeaders['X-Frame-Options'];
			} else if (d.responseHeaders['x-frame-options']) {
				delete d.responseHeaders['x-frame-options'];
			}
			c({cancel: false, responseHeaders: d.responseHeaders});
		}
	);

	if (isDevelopment) {
		win.loadURL('http://127.0.0.1:3000/');
	} else {
		win.loadFile(path.normalize(`${__dirname}/../../dist/index.html`));
	}
}

const registerIPC = () => {
	ipcMain.on('set-title', (event, title) => {
		BrowserWindow.fromWebContents(event.sender)?.setTitle(title);
	});

	// opens the tunnel if necessary, returns the phpMyAdmin server index
	ipcMain.handle('new-connection', async (event, connection) => {
		try {
			await tunnelManager.open(connection);
			return connection.id;
		} catch (err) {
			dialog.showMessageBox(BrowserWindow.fromWebContents(event.sender), {
				type: 'error',
				title: 'Connection failed',
				message: `Could not open connection "${connection.name}"`,
				detail: err.message,
			});
			throw err;
		}
	});

	// last tab of a connection was closed
	ipcMain.handle('close-connection', async (event, connectionId) => {
		await tunnelManager.close(connectionId);
	});

	ipcMain.handle('save-connection', async (event, connection) => {
		// a changed host or port needs a new tunnel
		const old = await dbInstance.table('connections').where({ id: connection.id }).first();
		if (old && (old.ssh_host != connection.ssh_host || old.mysql_port != connection.mysql_port)) {
			await tunnelManager.close(connection.id);
		}
		// convert boolean to sqlite integer
		connection.favorite = connection.favorite ? 1 : 0;
		return await dbInstance.table('connections').insert({...connection}).onConflict('id').merge();
	});

	ipcMain.handle('delete-connection', async (event, connectionId) => {
		await tunnelManager.close(connectionId);
		return await dbInstance.table('connections').where({'id': connectionId}).del();
	});

	ipcMain.handle('get-connections', async () => {
		const connections = await dbInstance.table('connections').select('*').orderBy('name');
		// convert sqlite integer field to boolean
		connections.forEach(c => c.favorite = !!c.favorite);
		return connections;
	});

	ipcMain.handle('get-settings', () => {
		return settings;
	});
	ipcMain.handle('save-settings', async (event, s) => {
		settings = s;
		const query = dbInstance.table('settings');
		const keys = [];
		for (let [key, value] of Object.entries(settings)) {
			keys.push(key);
			await query.clone().insert({ 'key': key, 'value': value }).onConflict('key').merge();
		}
		await query.clone().del().whereNotIn('key', keys);
	});

	ipcMain.handle('get-pmaoptions', () => {
		return pmaOptions;
	});

	ipcMain.handle('get-dirname', () => {
		return __dirname;
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
	});
	const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head>
		<body style="font-family: sans-serif; color: #444; margin: 16px;">
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
	} catch (e) {}
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
	} catch(err) {
		dialog.showErrorBox('DB Error', `Your database seems to be broken:\n\n${err.stack}`);
		return quit();
	}

	const settingsRows = await dbInstance.table('settings');
	settingsRows.forEach((s) => {
		settings[s.key] = s.value;
	});

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

	try {
		await phpServer.start(getPHPPort());
	} catch (err) {
		progressWindow?.close();
		dialog.showErrorBox('Error starting PHP', err.message);
		return quit();
	}

	pmaOptions = await phpServer.getPMAOptions();

	registerIPC();
	await createMainWindow();
	progressWindow?.close();

	notifyPMAUpdate();
});