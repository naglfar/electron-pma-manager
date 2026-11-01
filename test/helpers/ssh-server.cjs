'use strict'

// Local ssh server and echo server for tunnel tests, any authentication is accepted

const net = require('net');
const { Server, utils } = require('ssh2');

const listen = (server) => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));

// echo server standing in for mysql
const startEchoServer = async () => {
	const server = net.createServer(socket => socket.pipe(socket));
	const port = await listen(server);
	return { port, close: () => server.close() };
};

const startSSHServer = async () => {
	const hostKey = utils.generateKeyPairSync('ed25519');
	const clients = new Set();
	let logins = 0;
	const server = new Server({ hostKeys: [hostKey.private] }, client => {
		clients.add(client);
		client.on('close', () => clients.delete(client));
		client.on('error', () => {});
		client.on('authentication', ctx => ctx.accept());
		client.on('ready', () => logins++);
		client.on('tcpip', (accept, reject, info) => {
			const out = net.connect(info.destPort, info.destIP);
			const channel = accept();
			out.on('error', () => channel.close());
			out.pipe(channel).pipe(out);
		});
	});
	const port = await listen(server);
	return {
		port,
		// public key blob as in known_hosts
		hostKeyBlob: utils.parseKey(hostKey.public).getPublicSSH(),
		logins: () => logins,
		// drop all connections, e.g. a network failure
		disconnectAll: () => clients.forEach(c => c.end()),
		close: () => {
			clients.forEach(c => c.end());
			server.close();
		},
	};
};

// sends text through a local port and returns the echo
const echoThrough = (port, text = 'ping') => new Promise((resolve, reject) => {
	const socket = net.connect(port, '127.0.0.1');
	let data = '';
	socket.on('data', d => { data += d; socket.end(); });
	socket.on('close', () => resolve(data));
	socket.on('error', reject);
	socket.write(text);
	setTimeout(() => { socket.destroy(); reject(new Error('echo timeout')); }, 5000);
});

module.exports = { startEchoServer, startSSHServer, echoThrough };
