'use strict'

// PHP built-in web server serving phpMyAdmin

const fs = require('fs');
const path = require('path');
const net = require('net');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const electronSettings = require('electron-settings');
const { paths } = require('./paths');

const HOST = '127.0.0.1';
const START_TIMEOUT = 10000;

// every request needs this token, see router.php; new for each run
const TOKEN_HEADER = 'X-PMA-Manager-Token';
const token = crypto.randomBytes(32).toString('hex');
// outside the document root, php can't read it from the asar archive
const routerSource = path.normalize(`${__dirname}/../pma/router.php`);
const routerPath = path.join(paths.userData, 'pma-router.php');

let phpProcess = null;
let port = null;
// last lines of stderr, shown when php fails
let stderrLines = [];

const hasPHP = () => {
	const exts = (process.env.PATHEXT || '').split(path.delimiter);
	return (process.env.PATH || '').replace(/["]+/g, '').split(path.delimiter).some(dir => {
		return exts.some(ext => {
			try {
				return fs.statSync(path.join(dir, `php${ext}`)).isFile();
			} catch (e) {
				return false;
			}
		});
	});
};

const isPortFree = (p) => new Promise((resolve) => {
	const server = net.createServer();
	server.once('error', () => resolve(false));
	server.listen(p, HOST, () => server.close(() => resolve(true)));
});

const getSecret = async () => {
	let secret = await electronSettings.get('pmaSecret');
	if (!secret) {
		secret = crypto.randomBytes(32).toString('hex');
		await electronSettings.set('pmaSecret', secret);
	}
	return secret;
};

const request = (urlPath, method = 'GET') => new Promise((resolve, reject) => {
	const req = http.request({ host: HOST, port, path: urlPath, method, timeout: 5000, headers: { [TOKEN_HEADER]: token } }, (res) => {
		let body = '';
		res.on('data', data => body += data);
		res.on('end', () => resolve({ status: res.statusCode, body }));
	});
	req.on('timeout', () => req.destroy(new Error('timeout')));
	req.on('error', reject);
	req.end();
});

const waitForServer = async (proc) => {
	const started = Date.now();
	while (Date.now() - started < START_TIMEOUT) {
		if (proc.exitCode !== null || proc.signalCode !== null) {
			throw new Error(`PHP server exited (${proc.exitCode ?? proc.signalCode}):\n${stderrLines.join('\n')}`);
		}
		try {
			await request('/pmadata.php', 'HEAD');
			return;
		} catch (e) {
			await new Promise(r => setTimeout(r, 100));
		}
	}
	throw new Error(`PHP server did not start within ${START_TIMEOUT / 1000}s:\n${stderrLines.join('\n')}`);
};

const start = async (serverPort) => {
	if (phpProcess) {
		return;
	}
	if (!await isPortFree(serverPort)) {
		throw new Error(`Port ${serverPort} is already in use. Change the starting port in the settings.`);
	}
	fs.mkdirSync(paths.pmaTmp, { recursive: true });
	fs.copyFileSync(routerSource, routerPath);

	port = serverPort;
	stderrLines = [];
	const proc = spawn('php', [
		'-S', `${HOST}:${port}`,
		'-t', paths.pma,
		'-d', 'display_errors=1',
		'-d', 'expose_php=0',
		routerPath,
	], {
		stdio: ['ignore', 'ignore', 'pipe'],
		env: {
			...process.env,
			PMA_MANAGER_DB: paths.db,
			PMA_MANAGER_TMP: paths.pmaTmp,
			PMA_MANAGER_SECRET: await getSecret(),
			PMA_MANAGER_TOKEN: token,
		},
	});
	proc.stderr.on('data', (data) => {
		stderrLines.push(...data.toString().split('\n').filter(l => l.trim()));
		stderrLines = stderrLines.slice(-20);
	});
	proc.on('error', (err) => stderrLines.push(err.message));
	proc.on('exit', () => {
		if (phpProcess === proc) phpProcess = null;
	});
	phpProcess = proc;

	try {
		await waitForServer(proc);
	} catch (e) {
		stop();
		throw e;
	}
};

const stop = () => new Promise((resolve) => {
	const proc = phpProcess;
	phpProcess = null;
	if (!proc || proc.exitCode !== null || proc.signalCode !== null) {
		return resolve();
	}
	const timer = setTimeout(() => proc.kill('SIGKILL'), 3000);
	proc.once('exit', () => {
		clearTimeout(timer);
		resolve();
	});
	proc.kill();
});

const isRunning = () => !!phpProcess;

// webviews use localhost, see isServerUrl
const getUrl = () => port ? `http://localhost:${port}` : '';

// url served by this php server
const isServerUrl = (url) => {
	try {
		const u = new URL(url);
		return u.protocol == 'http:' && ['localhost', HOST].includes(u.hostname) && u.port == String(port);
	} catch (e) {
		return false;
	}
};

// languages and themes of the installed phpMyAdmin
const getPMAOptions = async () => {
	try {
		const res = await request('/pmadata.php');
		return JSON.parse(res.body);
	} catch (e) {
		return {};
	}
};

module.exports = {
	HOST,
	TOKEN_HEADER,
	token,
	isServerUrl,
	getUrl,
	hasPHP,
	start,
	stop,
	isRunning,
	getPMAOptions,
};
