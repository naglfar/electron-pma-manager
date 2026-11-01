'use strict'

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const { utils } = require('ssh2');
const knex = require('knex');
const { TunnelManager, resolveSSHOptions } = require('../../src/electron/tunnels');
const { startEchoServer, startSSHServer, echoThrough } = require('../helpers/ssh-server.cjs');

// first port to try for tunnels, getStartPort of TunnelManager is synchronous
const freePort = () => new Promise(resolve => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pma-tunnels-'));
let ssh, echo, db, startPort;

before(async () => {
	startPort = await freePort();
	ssh = await startSSHServer();
	echo = await startEchoServer();
	db = knex({ client: 'sqlite3', connection: { filename: ':memory:' }, useNullAsDefault: true });
	await db.schema.createTable('tunnels', t => { t.increments(); t.integer('connection'); t.integer('port'); });
});
after(async () => {
	ssh.close();
	echo.close();
	await db.destroy();
});

// ssh config with its own known_hosts file
const sshConfig = (knownHosts, extra = '') => `Host *\n  UserKnownHostsFile ${knownHosts}\n  GlobalKnownHostsFile none\n${extra}`;
const connection = (id, extra = {}) => ({ id, name: `c${id}`, ssh_host: `test@127.0.0.1:${ssh.port}`, mysql_port: String(echo.port), ...extra });

test('resolveSSHOptions applies ~/.ssh/config', () => {
	const plainKey = utils.generateKeyPairSync('ed25519').private;
	const encryptedKey = utils.generateKeyPairSync('ed25519', { passphrase: 'secret', cipher: 'aes256-ctr' }).private;
	fs.writeFileSync(path.join(tmpDir, 'plain'), plainKey);
	fs.writeFileSync(path.join(tmpDir, 'encrypted'), encryptedKey);
	const config = `Host alias\n  HostName real.example.com\n  User cfguser\n  Port 2200\n  IdentityFile ${tmpDir}/encrypted\n  IdentityFile ${tmpDir}/plain\n  StrictHostKeyChecking accept-new\n`;

	let o = resolveSSHOptions('alias', config);
	assert.deepStrictEqual([o.ssh.host, o.ssh.port, o.ssh.username, o.strictHostKeyChecking], ['real.example.com', 2200, 'cfguser', 'accept-new']);
	assert.strictEqual(o.ssh.privateKey.toString(), plainKey, 'encrypted keys are skipped');

	o = resolveSSHOptions('bob@alias:2022', config);
	assert.deepStrictEqual([o.ssh.host, o.ssh.port, o.ssh.username], ['real.example.com', 2022, 'bob']);

	o = resolveSSHOptions('other', config);
	assert.deepStrictEqual([o.ssh.host, o.ssh.port, o.strictHostKeyChecking], ['other', 22, 'ask']);
});

test('tunnels: ports, sharing, reconnect, close', async () => {
	const knownHosts = path.join(tmpDir, 'kh-basic');
	const blocked = await freePort();
	const blocker = net.createServer().listen(blocked, '127.0.0.1');
	const tm = new TunnelManager(db, () => blocked, { sshConfigText: sshConfig(knownHosts, '  StrictHostKeyChecking accept-new\n') });

	await db.table('tunnels').insert({ connection: 99, port: 1 });
	await tm.reset();
	assert.strictEqual((await db.table('tunnels')).length, 0, 'stale rows are removed');

	const loginsBefore = ssh.logins();
	const [p1, p2] = await Promise.all([tm.open(connection(1)), tm.open(connection(1))]);
	assert.strictEqual(p1, p2, 'parallel opens share one tunnel');
	assert.strictEqual(p1, blocked + 1, 'a used port is skipped');
	assert.strictEqual(ssh.logins() - loginsBefore, 1);
	assert.strictEqual(await echoThrough(p1), 'ping');

	ssh.disconnectAll();
	await new Promise(r => setTimeout(r, 300));
	assert.strictEqual(await echoThrough(p1), 'ping', 'reconnects after the ssh connection dropped');

	// mysql host as seen from the ssh server
	const p3 = await tm.open(connection(3, { mysql_host: 'localhost' }));
	assert.strictEqual(await echoThrough(p3), 'ping');

	// without ssh the port of the mysql server is used directly
	assert.strictEqual(await tm.open({ id: 4, name: 'direct', mysql_port: '3307' }), 3307);

	await tm.close(1);
	await assert.rejects(echoThrough(p1));
	await tm.closeAll();
	assert.strictEqual((await db.table('tunnels')).length, 0);
	await assert.rejects(echoThrough(p3));
	blocker.close();
});

test('unreachable ssh host', async () => {
	const tm = new TunnelManager(db, () => startPort, { sshConfigText: '' });
	await assert.rejects(tm.open({ id: 5, name: 'bad', ssh_host: 'x@127.0.0.1:1' }), /SSH connection to x@127.0.0.1:1 failed/);
	assert.strictEqual(await db.table('tunnels').where({ connection: 5 }).first(), undefined);
});

test('host key checking', async () => {
	const knownHosts = path.join(tmpDir, 'kh-hostkeys');
	const name = `[127.0.0.1]:${ssh.port}`;
	let prompts = [];
	let answer = false;
	const onHostKey = async (info) => { prompts.push(info); return answer; };
	const manager = (extra = '') => new TunnelManager(db, () => startPort, { onHostKey, sshConfigText: sshConfig(knownHosts, extra) });

	// unknown, declined
	let tm = manager();
	await assert.rejects(tm.open(connection(10)), /was not accepted/);
	assert.strictEqual(prompts[0].status, 'unknown');
	assert.strictEqual(prompts[0].host, name);
	assert.ok(!fs.existsSync(knownHosts));

	// unknown, accepted: one question for parallel connections, saved
	prompts = [];
	answer = true;
	await Promise.all([tm.open(connection(10)), tm.open(connection(11))]);
	assert.strictEqual(prompts.length, 1);
	assert.strictEqual(fs.readFileSync(knownHosts, 'utf8'), `${name} ssh-ed25519 ${ssh.hostKeyBlob.toString('base64')}\n`);
	await tm.closeAll();

	// known: no question
	prompts = [];
	tm = manager();
	await tm.open(connection(10));
	assert.strictEqual(prompts.length, 0);
	await tm.closeAll();

	// changed key: rejected, reported
	const otherKey = utils.parseKey(utils.generateKeyPairSync('ed25519').public).getPublicSSH();
	fs.writeFileSync(knownHosts, `${name} ssh-ed25519 ${otherKey.toString('base64')}\n`);
	tm = manager();
	await assert.rejects(tm.open(connection(10)), /has changed/);
	assert.strictEqual(prompts[0].status, 'changed');

	// StrictHostKeyChecking
	fs.rmSync(knownHosts);
	prompts = [];
	await assert.rejects(manager('  StrictHostKeyChecking yes\n').open(connection(10)), /StrictHostKeyChecking/);
	tm = manager('  StrictHostKeyChecking accept-new\n  HashKnownHosts yes\n');
	await tm.open(connection(10));
	assert.strictEqual(prompts.length, 0);
	assert.ok(fs.readFileSync(knownHosts, 'utf8').startsWith('|1|'));
	await tm.closeAll();
});
