'use strict'

const fs = require('fs');
const path = require('path');
const os = require('os');
const { app, BrowserWindow, globalShortcut, ipcMain, dialog, screen } = require('electron')
const electronSettings = require('electron-settings');
const PHPServer = require('php-server-manager');
const knex = require('knex');
const tunnel = require('tunnel-ssh');
const SSHConfig = require('ssh-config');

const dbConfig = require('./database/knexfile.js');
let dbInstance;
const isDevelopment = process.env.NODE_ENV !== 'production';

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

async function createWindow() {

	const win = new BrowserWindow({
		icon: `${__dirname}/assets/logo.png`,
		fullscreen: false,
		autoHideMenuBar: false,
		autoHideMenuBar: true,
		menuBarVisible: false,

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

		if (connection.host) {
			const query = dbInstance.table('tunnels').max('port as port').first();
			const lastPort = await query;
			const port = Math.max(lastPort.port && lastPort.port, settings.startingport || 4406) + 1;

			const config = {
				username: os.userInfo().username,
				host: connection.host,
				dstPort: connection.port,
				localHost:'127.0.0.1',
				localPort: port,
				keepAlive:true,
				// debug: (log) => console.log(log),
				agent: process.env.SSH_AUTH_SOCK || null,
			};

			try {
				const sshConfFile = fs.readFileSync(`${os.homedir()}/.ssh/config`, 'utf8');
				const sshConfig = SSHConfig.parse(sshConfFile);
				const configHost = sshConfig.compute(connection.host);
				// console.log(host);
				// console.log(configHost);
				if (configHost.HostName) config.host = configHost.HostName;
				if (configHost.Port) config.port = configHost.Port;
				if (configHost.User) config.username = configHost.User;
				if (configHost.IdentityFile) {
					if (configHost.IdentityFile.startsWith('~/')) {
						configHost.IdentityFile = configHost.IdentityFile.replace('~/', `${os.homedir()}/`);
					}
					config.privateKey = fs.readFileSync(configHost.IdentityFile);
				}
			} catch (err) {}

			try {
				const tnl = tunnel(config, (error, tnl) => {});
				tunnels.push(tnl);
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
		for (let [key, value] of Object.entries(settings)) {
			query.insert({ 'key': key, 'value': value })
		};
		query.onConflict('key').merge();
		await query;
	});

	ipcMain.handle('get-pmaoptions', () => {
		return pmaOptions;
	});

	ipcMain.handle('get-dirname', () => {
		return __dirname;
	});

	if (isDevelopment) {
		win.loadURL('http://' + phpServer.host + ':3000/');
	} else {
		win.loadURL('http://' + phpServer.host + ':' + phpServer.port + '/');
	}
}

const quit = async () => {
	tunnels.forEach(tunnel => tunnel.close());
	phpServer.close();
	await dbInstance.table('tunnels').del();
	await dbInstance.destroy();
	app.quit()
}

const getPMAOptions = async () => {
	return await new Promise(r => {
		const http = require('http');
		const req = http.request({
			hostname: 'localhost',
			port: settings.startingport || 4406,
			path: '/pma/pmadata.php',
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

	mainWindowStateKeeper = await windowStateKeeper('main');

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

	phpServer = new PHPServer({
		port: settings.startingport || 4406,
		directory: isDevelopment ? `${__dirname}/` : `${__dirname}/../dist`,
		stdio: 'ignore',
		directives: {
			display_errors: 1,
			expose_php: 1
		}
	});
	await phpServer.run();

	pmaOptions = await getPMAOptions();

	createWindow();
});