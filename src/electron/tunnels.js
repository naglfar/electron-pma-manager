'use strict'

// SSH tunnels to the mysql servers of the connections.
// The local ports are written to the tunnels table, config.inc.php reads them from there.

const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');
const { Client, utils: sshUtils } = require('ssh2');
const { DEFAULT_SERVER_HOST_KEY } = require('ssh2/lib/protocol/constants');
const SSHConfig = require('ssh-config');
const { KnownHosts } = require('./known-hosts');

const LOCAL_HOST = '127.0.0.1';
const PORT_RANGE = 100;

const expandHome = (file) => file.startsWith('~/') ? path.join(os.homedir(), file.substring(2)) : file;

// ssh config values may be space separated lists
const configList = (value) => [].concat(value || []).flatMap(v => String(v).split(/\s+/)).filter(v => v);

// parse "[user@]host[:port]" and apply ~/.ssh/config
// returns { ssh: ssh2 connect options, strictHostKeyChecking, knownHosts }
const resolveSSHOptions = (sshHost, sshConfigText) => {
	let host = sshHost.trim();
	let username = os.userInfo().username;
	let port = 22;
	if (host.includes('@')) {
		username = host.substring(0, host.lastIndexOf('@'));
		host = host.substring(host.lastIndexOf('@') + 1);
	}
	const portMatch = host.match(/^(.*):(\d+)$/);
	if (portMatch) {
		host = portMatch[1];
		port = parseInt(portMatch[2], 10);
	}

	const options = {
		host,
		port,
		username,
		agent: process.env.SSH_AUTH_SOCK || undefined,
		keepaliveInterval: 10000,
		keepaliveCountMax: 3,
		readyTimeout: 20000,
	};
	let strictHostKeyChecking = 'ask';
	let knownHostsOptions = {};

	try {
		if (sshConfigText === undefined) {
			sshConfigText = fs.readFileSync(path.join(os.homedir(), '.ssh', 'config'), 'utf8');
		}
		const configHost = SSHConfig.parse(sshConfigText).compute(host);
		if (configHost.HostName) options.host = configHost.HostName;
		if (configHost.Port && !portMatch) options.port = parseInt(configHost.Port, 10);
		if (configHost.User && !sshHost.includes('@')) options.username = configHost.User;
		// use the first unencrypted key, encrypted keys have to come from the agent
		for (const identityFile of [].concat(configHost.IdentityFile || [])) {
			try {
				const key = fs.readFileSync(expandHome(identityFile));
				if (!(sshUtils.parseKey(key) instanceof Error)) {
					options.privateKey = key;
					break;
				}
			} catch (e) {
				// missing or unreadable key file, try the next one
			}
		}
		if (configHost.StrictHostKeyChecking) {
			strictHostKeyChecking = String(configHost.StrictHostKeyChecking).toLowerCase();
		}
		if (configHost.UserKnownHostsFile) {
			const files = configList(configHost.UserKnownHostsFile);
			knownHostsOptions.userFiles = files.includes('none') ? [] : files;
		}
		if (configHost.GlobalKnownHostsFile) {
			const files = configList(configHost.GlobalKnownHostsFile);
			knownHostsOptions.globalFiles = files.includes('none') ? [] : files;
		}
		knownHostsOptions.hashHosts = String(configHost.HashKnownHosts || '').toLowerCase() == 'yes';
	} catch (e) {
		// no ~/.ssh/config
	}

	const knownHosts = new KnownHosts(knownHostsOptions);
	options.algorithms = {
		serverHostKey: knownHosts.preferredAlgorithms(options.host, options.port, DEFAULT_SERVER_HOST_KEY),
	};

	return { ssh: options, strictHostKeyChecking, knownHosts };
};

class Tunnel {
	// dstHost: mysql host as seen from the ssh server
	// verifyHostKey: (key) => Promise<{ ok, reason }>
	constructor(sshOptions, dstHost, dstPort, verifyHostKey) {
		this.sshOptions = sshOptions;
		this.dstHost = dstHost;
		this.dstPort = dstPort;
		this.verifyHostKey = verifyHostKey;
		this.server = null;
		this.client = null;
		this.connecting = null;
		this.sockets = new Set();
	}

	get port() {
		return this.server?.address()?.port;
	}

	// connect ssh first so wrong credentials fail early, then listen locally
	async open(startPort) {
		await this.getClient();
		try {
			this.server = await this.listen(startPort);
		} catch (e) {
			this.close();
			throw e;
		}
		this.server.on('connection', socket => this.forward(socket));
	}

	async listen(startPort) {
		for (let port = startPort; port < startPort + PORT_RANGE; port++) {
			try {
				return await new Promise((resolve, reject) => {
					const server = net.createServer();
					server.once('error', reject);
					server.listen(port, LOCAL_HOST, () => {
						server.removeListener('error', reject);
						server.on('error', err => console.error('Tunnel server error', err));
						resolve(server);
					});
				});
			} catch (e) {
				if (e.code !== 'EADDRINUSE') throw e;
			}
		}
		throw new Error(`No free port found between ${startPort} and ${startPort + PORT_RANGE - 1}`);
	}

	// ssh connection, (re)connected on demand
	getClient() {
		if (this.client) {
			return Promise.resolve(this.client);
		}
		if (!this.connecting) {
			this.connecting = new Promise((resolve, reject) => {
				const client = new Client();
				let hostKeyError = null;
				client.once('ready', () => {
					this.client = client;
					this.connecting = null;
					resolve(client);
				});
				client.on('error', (err) => {
					if (this.connecting) {
						this.connecting = null;
						reject(new Error(`SSH connection to ${this.sshOptions.username}@${this.sshOptions.host}:${this.sshOptions.port} failed: ${hostKeyError || err.message}`));
					} else {
						console.error('SSH error', err.message);
					}
				});
				client.on('close', () => {
					if (this.client === client) this.client = null;
				});
				client.connect({
					...this.sshOptions,
					hostVerifier: (key, callback) => {
						this.verifyHostKey(key).then(({ ok, reason }) => {
							hostKeyError = reason;
							callback(ok);
						}, (err) => {
							hostKeyError = err.message;
							callback(false);
						});
					},
				});
			});
		}
		return this.connecting;
	}

	async forward(socket) {
		this.sockets.add(socket);
		socket.on('close', () => this.sockets.delete(socket));
		socket.on('error', () => {});
		try {
			const client = await this.getClient();
			client.forwardOut(LOCAL_HOST, socket.remotePort || 0, this.dstHost, this.dstPort, (err, stream) => {
				if (err || socket.destroyed) {
					if (err) console.error('SSH forward failed', err.message);
					socket.destroy();
					stream?.close();
					return;
				}
				stream.on('error', () => socket.destroy());
				stream.on('close', () => socket.destroy());
				socket.on('close', () => stream.close());
				socket.pipe(stream).pipe(socket);
			});
		} catch (err) {
			console.error(err.message);
			socket.destroy();
		}
	}

	close() {
		this.server?.close();
		this.sockets.forEach(socket => socket.destroy());
		this.client?.end();
		this.client = null;
	}
}

class TunnelManager {
	// db: knex instance, getStartPort: first port to try for tunnels
	// onHostKey: (info) => Promise<boolean>, asks to trust an unknown host key and
	//   reports changed / revoked keys (info.status), sshConfigText: for tests
	constructor(db, getStartPort, { onHostKey, sshConfigText } = {}) {
		this.db = db;
		this.getStartPort = getStartPort;
		this.onHostKey = onHostKey || (async () => false);
		this.sshConfigText = sshConfigText;
		this.tunnels = new Map();
		this.opening = new Map();
		this.hostKeyPrompts = new Map();
	}

	async verifyHostKey(resolved, key) {
		const { host, port } = resolved.ssh;
		const info = resolved.knownHosts.check(host, port, key);
		const strict = resolved.strictHostKeyChecking;
		switch (info.status) {
			case 'known':
				return { ok: true };
			case 'changed':
			case 'revoked':
				await this.onHostKey(info);
				return { ok: false, reason: `Host key of ${info.host} ${info.status == 'changed' ? 'has changed' : 'is revoked'} (${info.fingerprint})` };
		}
		if (strict == 'yes') {
			return { ok: false, reason: `Host key of ${info.host} is not known and StrictHostKeyChecking is enabled (${info.fingerprint})` };
		}
		let ok = true;
		if (strict == 'ask') {
			// one question for parallel connections to the same host
			const promptKey = `${info.host} ${info.fingerprint}`;
			if (!this.hostKeyPrompts.has(promptKey)) {
				this.hostKeyPrompts.set(promptKey, Promise.resolve(this.onHostKey(info)).finally(() => this.hostKeyPrompts.delete(promptKey)));
			}
			ok = await this.hostKeyPrompts.get(promptKey);
			if (ok && resolved.knownHosts.check(host, port, key).status == 'known') {
				// added by a parallel connection
				return { ok };
			}
		}
		if (!ok) {
			return { ok, reason: `Host key of ${info.host} was not accepted (${info.fingerprint})` };
		}
		resolved.knownHosts.add(host, port, key);
		return { ok };
	}

	// remove entries left from a crash
	async reset() {
		await this.db.table('tunnels').del();
	}

	// open the tunnel of a connection if necessary, returns the local port
	open(connection) {
		if (this.opening.has(connection.id)) {
			return this.opening.get(connection.id);
		}
		const promise = this.doOpen(connection).finally(() => this.opening.delete(connection.id));
		this.opening.set(connection.id, promise);
		return promise;
	}

	async doOpen(connection) {
		const existing = await this.db.table('tunnels').where({ connection: connection.id }).first();
		if (existing) {
			return existing.port;
		}

		const dstPort = parseInt(connection.mysql_port, 10) || 3306;
		const dstHost = (connection.mysql_host || '').trim() || '127.0.0.1';
		// without ssh phpMyAdmin connects directly, see config.inc.php
		let port = dstPort;
		if (connection.ssh_host) {
			const resolved = resolveSSHOptions(connection.ssh_host, this.sshConfigText);
			const tunnel = new Tunnel(resolved.ssh, dstHost, dstPort, key => this.verifyHostKey(resolved, key));
			await tunnel.open(this.getStartPort());
			port = tunnel.port;
			this.tunnels.set(connection.id, tunnel);
		}
		await this.db.table('tunnels').insert({ connection: connection.id, port });
		return port;
	}

	async close(connectionId) {
		this.tunnels.get(connectionId)?.close();
		this.tunnels.delete(connectionId);
		await this.db.table('tunnels').where({ connection: connectionId }).del();
	}

	async closeAll() {
		this.tunnels.forEach(tunnel => tunnel.close());
		this.tunnels.clear();
		await this.db.table('tunnels').del();
	}
}

module.exports = { TunnelManager, resolveSSHOptions };
