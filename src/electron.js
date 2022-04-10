'use strict'

const fs = require('fs');
const path = require('path');
const os = require('os');
const { app, BrowserWindow, globalShortcut, ipcMain, dialog } = require('electron')
const settings = require('electron-settings');
const PHPServer = require('php-server-manager');
const knex = require('knex');
const tunnel = require('tunnel-ssh');
const SSHConfig = require('ssh-config');

const dbConfig = require('./database/knexfile.js');
let dbInstance;
const isDevelopment = process.env.NODE_ENV !== 'production'


const phpServer = new PHPServer({
	port: 4405,
	directory: isDevelopment ? `${__dirname}/` : `${__dirname}/../dist`,
	stdio: 'ignore',
	directives: {
		display_errors: 1,
		expose_php: 1
	}
});

const tunnels = [];

async function createWindow() {

	phpServer.run();

	const win = new BrowserWindow({
		fullscreen: false,
		autoHideMenuBar: false,
		webPreferences: {
			preload: path.join(__dirname, 'electron-preload.js'),
			webviewTag: true,
		},
		autoHideMenuBar: true,
		menuBarVisible: false,
		icon: `${__dirname}/assets/logo.png`,
	});

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

	ipcMain.handle('new-connection', async (event, host, connectionId) => {

		let port = 3306;

		if (host) {
			const query = dbInstance.table('tunnels').max('port as port').first();
			const lastPort = await query;
			port = lastPort.port && lastPort.port + 1 || 4406;

			const config = {
				username: os.userInfo().username,
				host: host,
				dstPort: 3306,
				localHost:'127.0.0.1',
				localPort: port,
				keepAlive:true,
				// debug: (log) => console.log(log),
				agent: process.env.SSH_AUTH_SOCK || null,
			};

			try {
				const sshConfFile = fs.readFileSync(`${os.homedir()}/.ssh/config`, 'utf8');
				const sshConfig = SSHConfig.parse(sshConfFile);
				const configHost = sshConfig.compute(host);
				// console.log(host);
				// console.log(configHost);
				if (configHost.HostName) config.host = configHost.HostName;
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
				await dbInstance.table('tunnels').insert({connection: connectionId, port: port});
			} catch (err) {
				console.log(err);
			}
		} else {

			await dbInstance.table('tunnels').insert({connection: connectionId, port: port});
		}

		// console.log(config);
	});

	ipcMain.handle('save-connection', async (event, connection) => {
		const query = dbInstance.table('connections').insert({...connection}).onConflict('id').merge();
		return await query;
	});

	ipcMain.handle('delete-connection', async (event, connectionId) => {
		const query = dbInstance.table('connections').where({'id': connectionId}).del();
		return await query;
	});

	ipcMain.handle('get-connections', async () => {
		const query = dbInstance.table('connections').select('*').orderBy('name');
		return await query;
	});
	ipcMain.handle('get-tunnels', async () => {
		const query = dbInstance.table('tunnels').select('*');
		return await query;
	})

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

// Quit when all windows are closed.
app.on('window-all-closed', quit);

app.on('ready', async () => {

	dbInstance = knex(dbConfig);
	try {
		await dbInstance.migrate.latest();
	} catch(err) {
		dialog.showErrorBox('DB Error', 'Your database seems to be broken, sorry.');
		app.quit();
	}

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

	createWindow();
});