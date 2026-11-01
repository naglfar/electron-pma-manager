'use strict'

const fs = require('fs');
const path = require('path');
const os = require('os');
const { app, BrowserWindow, globalShortcut, ipcMain, dialog, screen, Notification } = require('electron')
const { paths, migrateLegacyData } = require('./paths');
const pma = require('./pma');
const electronSettings = require('electron-settings');
const PHPServer = require('php-server-manager');
const knex = require('knex');
const { createTunnel } = require('tunnel-ssh');
const SSHConfig = require('ssh-config');
const crypto = require('crypto');

const isDevelopment = process.env.NODE_ENV === 'dev';

const dbConfig = require('./database/knexfile.js');
let dbInstance;

const tunnels = [];
let settings = {};
let pmaOptions = {};
let phpServer;

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

	ipcMain.on('set-title', (event, title) => {
		const webContents = event.sender;
		const win = BrowserWindow.fromWebContents(webContents);
		win.setTitle(title);
	});

	ipcMain.handle('new-connection', async (event, connection) => {

		const existing =  await dbInstance.table('tunnels').select('id').where({'connection': connection.id}).first();
		if (existing) { return }

		// console.log(connection);

		if (connection.ssh_host) {
			const query = dbInstance.table('tunnels').max('port as port').first();
			const lastPort = await query;
			const port = Math.max(lastPort.port && lastPort.port, settings.startingport || 4406) + 1;

			let host = connection.ssh_host;
			let username = os.userInfo().username;
			if (host.includes('@')) {
				username = host.substr(0, host.indexOf('@'));
				host = host.substr(host.indexOf('@') + 1);
			}
			// if (host.indexOf(':')) {
			// 	port = host.substr(host.indexOf('@') + 1);
			// }

			const config = {
				username,
				host,
				keepaliveInterval: 10000,
				// debug: (log) => console.log(log),
				agent: process.env.SSH_AUTH_SOCK || undefined,
			};

			try {
				const sshConfFile = fs.readFileSync(path.normalize(`${os.homedir()}/.ssh/config`), 'utf8');
				const sshConfig = SSHConfig.parse(sshConfFile);
				const configHost = sshConfig.compute(host);
				// console.log(host);
				// console.log(configHost);
				if (configHost.HostName) config.host = configHost.HostName;
				if (configHost.Port) config.port = configHost.Port;
				if (configHost.User) config.username = configHost.User;
				if (configHost.IdentityFile) {
					// ssh-config returns IdentityFile as array
					let identityFile = [].concat(configHost.IdentityFile)[0];
					if (identityFile.startsWith('~/')) {
						identityFile = identityFile.replace('~/', `${os.homedir()}${path.sep}`);
					}
					config.privateKey = fs.readFileSync(identityFile);
				}
			} catch (err) {}

			try {
				const [server] = await createTunnel(
					{ autoClose: false },
					{ host: '127.0.0.1', port },
					config,
					{ dstAddr: '127.0.0.1', dstPort: connection.mysql_port || 3306 },
				);
				tunnels.push(server);
				await dbInstance.table('tunnels').insert({connection: connection.id, port: port});
			} catch (err) {
				console.log(err);
			}
		} else {
			await dbInstance.table('tunnels').insert({connection: connection.id, port: connection.port || 3306 });
		}
	});

	ipcMain.handle('save-connection', async (event, connection) => {
		// convert boolean to sqlite integer
		connection.favorite = connection.favorite ? 1 : 0;
		const query = dbInstance.table('connections').insert({...connection}).onConflict('id').merge();
		return await query;
	});

	ipcMain.handle('delete-connection', async (event, connectionId) => {
		const query = dbInstance.table('connections').where({'id': connectionId}).del();
		return await query;
	});

	ipcMain.handle('get-connections', async () => {
		const query = dbInstance.table('connections').select('*').orderBy('name');
		const connections = await query;
		// convert sqlite integer field to boolean
		connections.forEach(c => c.favorite = !!c.favorite);
		return connections;
	});

	ipcMain.handle('get-tunnels', async () => {
		const query = dbInstance.table('tunnels').select('*');
		return await query;
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
			const q = query.clone();
			q.insert({ 'key': key, 'value': value })
			q.onConflict('key').merge();
			await q;
		};
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
		const onProgress = (step, progress) => {
			win.setProgressBar(progress);
			win.webContents.send('pma-update-progress', { step, progress });
		};
		try {
			await pma.install(version, onProgress, async () => phpServer.close());
		} finally {
			win.setProgressBar(-1);
			if (!phpServer.process) {
				await startPHPServer();
			}
		}
		pmaOptions = await getPMAOptions();
		return pmaOptions;
	});

	if (isDevelopment) {
		win.loadURL('http://127.0.0.1:3000/');
	} else {
		win.loadFile(path.normalize(`${__dirname}/../../dist/index.html`));
	}
}

const quit = async () => {
	try {
		tunnels.forEach(tunnel => tunnel.close());
		phpServer?.close();
		await dbInstance.table('tunnels').del();
		await dbInstance.destroy();
	} catch(e) {}
	app.quit()
}

const checkPHP = () => {
	function hasbin (bin) {
		return getPaths(bin).some(fileExists);
	}
	function getPaths (bin) {
		var envPath = (process.env.PATH || '');
		var envExt = (process.env.PATHEXT || '');
		return envPath.replace(/["]+/g, '').split(path.delimiter).map(function (chunk) {
			return envExt.split(path.delimiter).map(function (ext) {
				return path.join(chunk, bin + ext);
			});
		}).reduce(function (a, b) {
			return a.concat(b);
		});
	}
	function fileExists (filePath) {
		try {
			return fs.statSync(filePath).isFile();
		} catch (error) {
			return false;
		}
	}
	return hasbin('php');
}

const startPHPServer = async () => {
	fs.mkdirSync(paths.pmaTmp, { recursive: true });

	let secret = await electronSettings.get('pmaSecret');
	if (!secret) {
		secret = crypto.randomBytes(32).toString('hex');
		await electronSettings.set('pmaSecret', secret);
	}

	phpServer = new PHPServer({
		port: settings.startingport || 4406,
		directory: paths.pma,
		stdio: 'ignore',
		directives: {
			display_errors: 1,
			expose_php: 1
		},
		env: {
			PMA_MANAGER_DB: paths.db,
			PMA_MANAGER_TMP: paths.pmaTmp,
			PMA_MANAGER_SECRET: secret,
		},
	});
	await phpServer.run();
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

const getPMAOptions = async () => {
	return await new Promise(r => {
		const http = require('http');
		const req = http.request({
			hostname: phpServer.host,
			port: settings.startingport || 4406,
			path: '/pmadata.php',
			method: 'GET'
		}, res => {
			var body = '';
			res.on('data', data => {
				body += data;
			});
			res.on('end', () => {
				try {
					const json = JSON.parse(body)
					r(json);
				} catch(e) {
					r([]);
				}
			})
		});
		req.on('error', error => {
			r([]);
		})
		req.end()
	})
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

	if (!checkPHP()) {
		dialog.showErrorBox('PHP missing', `PHP is required to be installed and in your PATH for this.`);
		app.quit();
	}

	migrateLegacyData();

	dbInstance = knex(dbConfig);
	try {
		await dbInstance.migrate.latest();
	} catch(err) {
		dialog.showErrorBox('DB Error', `Your database seems to be broken:\n\n${err.stack}`);
		app.quit();
	}

	const settingsRows = await dbInstance.table('settings');
	settingsRows.forEach((s) => {
		settings[s.key] = s.value;
	});

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

	await startPHPServer();

	pmaOptions = await getPMAOptions();

	await createMainWindow();
	progressWindow?.close();

	notifyPMAUpdate();
});