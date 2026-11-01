// Starts the vite dev server and electron, stops vite when electron exits.

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
// the electron package exports the path of the binary
const electronPath = require('electron');

const server = await createServer();
await server.listen();
server.printUrls();

const devServerUrl = server.resolvedUrls.local[0];

const electron = spawn(electronPath, ['.'], {
	stdio: 'inherit',
	env: {
		...process.env,
		NODE_ENV: 'dev',
		VITE_DEV_SERVER_URL: devServerUrl,
	},
});

let stopping = false;
const stop = async (code) => {
	if (stopping) return;
	stopping = true;
	await server.close();
	process.exit(code);
};

electron.on('exit', (code) => stop(code ?? 0));
electron.on('error', (err) => {
	console.error('Starting electron failed:', err);
	stop(1);
});

// ctrl+c in the terminal: let electron shut down (tunnels, php server), then stop vite
for (const signal of ['SIGINT', 'SIGTERM']) {
	process.on(signal, () => {
		if (electron.exitCode === null && electron.signalCode === null) {
			electron.kill(signal);
		} else {
			stop(0);
		}
	});
}
