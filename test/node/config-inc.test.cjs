'use strict'

// src/pma/config.inc.php, run with the php cli like phpMyAdmin includes it

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const knex = require('knex');

const root = path.join(__dirname, '..', '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pma-config-'));
const pmaDir = path.join(tmp, 'phpMyAdmin');
const dbFile = path.join(tmp, 'db.sqlite');
let db;

before(async () => {
	fs.mkdirSync(path.join(pmaDir, 'themes', 'pmahomme'), { recursive: true });
	fs.mkdirSync(path.join(pmaDir, 'themes', 'boodark'), { recursive: true });
	fs.copyFileSync(path.join(root, 'src', 'pma', 'config.inc.php'), path.join(pmaDir, 'config.inc.php'));
	db = knex({ client: 'sqlite3', connection: { filename: dbFile }, useNullAsDefault: true });
	await db.migrate.latest({ directory: path.join(root, 'src', 'electron', 'database', 'migrations') });
	await db.table('connections').insert([
		{ id: 3, name: 'Via ssh', mysql_user: 'admin', ssh_host: 'jump', mysql_host: 'db.internal', mysql_port: '3306', mysql_password: 'enc:ignored' },
		{ id: 5, name: 'Direct', mysql_user: '', mysql_host: 'db.example.com', mysql_port: '3307' },
	]);
	await db.table('tunnels').insert([{ connection: 3, port: 4407 }, { connection: 5, port: 3307 }]);
});
after(() => db.destroy());

// $cfg of config.inc.php for a request with these headers, blowfish_secret (binary) as its length
const config = (headers = {}) => {
	const server = Object.entries(headers).map(([k, v]) => `$_SERVER['HTTP_${k.toUpperCase().replace(/-/g, '_')}'] = ${JSON.stringify(v)};`).join(' ');
	const out = execFileSync('php', ['-d', 'display_errors=stderr', '-r', `${server} include 'config.inc.php'; $cfg['blowfish_secret'] = strlen($cfg['blowfish_secret'] ?? ''); echo json_encode($cfg);`], {
		cwd: pmaDir,
		env: { ...process.env, PMA_MANAGER_DB: dbFile, PMA_MANAGER_TMP: tmp, PMA_MANAGER_SECRET: 'ab'.repeat(32) },
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	return JSON.parse(out.toString());
};
const credentials = (value) => Buffer.from(JSON.stringify(value)).toString('base64');

test('servers of the open connections, indexed by connection id', () => {
	const cfg = config();
	assert.deepStrictEqual(Object.keys(cfg.Servers), ['3', '5']);
	// ssh: the local end of the tunnel
	assert.strictEqual(cfg.Servers[3].host, '127.0.0.1');
	assert.strictEqual(cfg.Servers[3].port, 4407);
	assert.strictEqual(cfg.Servers[3].user, 'admin');
	assert.strictEqual(cfg.Servers[3].verbose, 'Via ssh');
	// direct connection
	assert.strictEqual(cfg.Servers[5].host, 'db.example.com');
	assert.strictEqual(cfg.Servers[5].port, 3307);
	assert.strictEqual(cfg.Servers[5].user, 'root');
});

test('passwords only come from the credentials header', () => {
	assert.strictEqual(config().Servers[3].password, '', 'not the encrypted value of the database');
	const cfg = config({ 'X-PMA-Manager-Credentials': credentials({ passwords: { 3: 'secret' }, controlpass: 'ctrl' }) });
	assert.strictEqual(cfg.Servers[3].password, 'secret');
	assert.strictEqual(cfg.Servers[5].password, '');
	assert.strictEqual(config({ 'X-PMA-Manager-Credentials': 'not base64 json' }).Servers[3].password, '');
});

test('light and dark theme', async () => {
	assert.strictEqual(config().ThemeDefault, 'pmahomme');
	assert.strictEqual(config({ 'X-PMA-Manager-Color-Scheme': 'dark' }).ThemeDefault, 'boodark');
	await db.table('settings').insert([{ key: 'theme', value: 'missing' }, { key: 'themedark', value: 'pmahomme' }]);
	assert.strictEqual(config().ThemeDefault, 'pmahomme', 'missing themes fall back to pmahomme');
	assert.strictEqual(config({ 'X-PMA-Manager-Color-Scheme': 'dark' }).ThemeDefault, 'pmahomme');
	await db.table('settings').whereIn('key', ['theme', 'themedark']).del();
});

test('settings: control user, language, additional phpMyAdmin settings', async () => {
	await db.table('settings').insert([
		{ key: 'usecontrol', value: '1' },
		{ key: 'controluser', value: 'pmauser' },
		{ key: 'language', value: 'de' },
		{ key: 'pma.MaxRows', value: '50' },
	]);
	const cfg = config({ 'X-PMA-Manager-Credentials': credentials({ passwords: {}, controlpass: 'ctrl' }) });
	assert.strictEqual(cfg.Servers[3].controluser, 'pmauser');
	assert.strictEqual(cfg.Servers[3].controlpass, 'ctrl');
	assert.strictEqual(cfg.Servers[3].controlhost, 'localhost');
	assert.strictEqual(cfg.Lang, 'de');
	assert.strictEqual(cfg.MaxRows, '50');
	assert.strictEqual(cfg.TempDir, tmp);
	assert.strictEqual(cfg.blowfish_secret, 32);

	await db.table('settings').where({ key: 'usecontrol' }).update({ value: '0' });
	assert.strictEqual(config().Servers[3].controluser, undefined);
});
