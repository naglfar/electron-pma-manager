'use strict'

const fs = require('fs');
const path = require('path');
const os = require('os');
const { app, BrowserWindow, globalShortcut, ipcMain } = require('electron')
const settings = require('electron-settings');
const PHPServer = require('php-server-manager');
const knex = require('knex');
const tunnel = require('tunnel-ssh');
const SSHConfig = require('ssh-config');
const { exit } = require('process');

const isDevelopment = process.env.NODE_ENV !== 'production'

const dbConfig = {
	client: 'sqlite3',
	connection: {
		filename: `${__dirname}/db.sqlite`,
	},
	useNullAsDefault: true,
};

// TODO: create database if none exists
// if (!fs.existsSync(`${__dirname}/db.sqlite`)) {
// 	// const instance = knex(dbConfig);
// 	console.log(`${__dirname}/db.sqlite`);
// 	// instance.raw('CREATE TABLE "connections";');
// }


const server = new PHPServer({
	port: 5555,
	directory: isDevelopment ? `${__dirname}/` : `${__dirname}/../dist`,
	stdio: 'ignore',
	directives: {
		display_errors: 1,
		expose_php: 1
	}
});

const tunnels = [];

async function createWindow() {

	// start php server
	server.run();

	// Create the browser window.
	const win = new BrowserWindow({
		fullscreen: false,
		autoHideMenuBar: false,
		webPreferences: {
			preload: path.join(__dirname, 'electron-preload.js'),
			webviewTag: true,
		}
	});
	win.removeMenu();

	win.webContents.session.webRequest.onHeadersReceived({ urls: [ "*://*/*" ] },	(d, c) => {
			if (d.responseHeaders['X-Frame-Options']){
				delete d.responseHeaders['X-Frame-Options'];
			} else if (d.responseHeaders['x-frame-options']) {
				delete d.responseHeaders['x-frame-options'];
			}
			c({cancel: false, responseHeaders: d.responseHeaders});
		}
	);

	ipcMain.on('set-title', (event, title) => {
		const webContents = event.sender
		const win = BrowserWindow.fromWebContents(webContents)
		win.setTitle(title)
	});

	ipcMain.handle('new-connection', async (event, host, connectionId) => {
		const instance = knex(dbConfig);
		let port = 3306;

		if (host) {
			const query = instance.table('tunnels').max('port as port').first();
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
				await instance.table('tunnels').insert({connection: connectionId, port: port});
			} catch (err) {
				console.log(err);
			}
		} else {

			await instance.table('tunnels').insert({connection: connectionId, port: port});
		}

		// console.log(config);
	});

	ipcMain.handle('get-connections', async () => {
		const instance = knex(dbConfig);
		const query = instance.table('connections').select('*').orderBy('name');
		return await query;
	});
	ipcMain.handle('get-tunnels', async () => {
		const instance = knex(dbConfig);
		const query = instance.table('tunnels').select('*');
		return await query;
	})

	if (isDevelopment) {
		win.loadURL('http://' + server.host + ':3000/');
	} else {
		win.loadURL('http://' + server.host + ':' + server.port + '/');
	}
}

const preQuit = async () => {
	tunnels.forEach(tunnel => tunnel.close());
	server.close();
	const instance = knex(dbConfig);
	await instance.table('tunnels').del();
}

// Quit when all windows are closed.
app.on('window-all-closed', async () => {
	preQuit();
	app.quit()
});

app.on('ready', () => {
	const fn = () => {
		preQuit();
		app.quit()
	};
	if (process.platform === 'win32') {
		process.on('message', (data) => {
			if (data === 'graceful-exit') {
				fn();
			}
		})
	} else {
		process.on('SIGINT', fn);
		process.on('SIGTERM', fn);
	}

	createWindow();
});