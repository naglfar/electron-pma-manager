'use strict'

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { utils } = require('ssh2');
const { KnownHosts, fingerprint, keyType } = require('../../src/electron/known-hosts');

const blob = () => utils.parseKey(utils.generateKeyPairSync('ed25519').public).getPublicSSH();
const tmpFile = (content = '') => {
	const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pma-kh-')), 'known_hosts');
	fs.writeFileSync(file, content);
	return file;
};
const line = (hosts, key) => `${hosts} ${keyType(key)} ${key.toString('base64')}\n`;
const hashed = (name) => {
	const salt = crypto.randomBytes(20);
	return `|1|${salt.toString('base64')}|${crypto.createHmac('sha1', salt).update(name).digest('base64')}`;
};

test('key type and fingerprint', () => {
	const key = blob();
	assert.strictEqual(keyType(key), 'ssh-ed25519');
	assert.match(fingerprint(key), /^SHA256:[A-Za-z0-9+/]{43}$/);
});

test('known, unknown, changed and revoked keys', () => {
	const key = blob(), other = blob();
	const kh = (content) => new KnownHosts({ userFiles: [tmpFile(content)], globalFiles: [] });

	assert.strictEqual(kh(line('example.com', key)).check('example.com', 22, key).status, 'known');
	assert.strictEqual(kh('').check('example.com', 22, key).status, 'unknown');
	assert.strictEqual(kh(line('example.com', other)).check('example.com', 22, key).status, 'changed');
	assert.strictEqual(kh(`@revoked ${line('example.com', key)}${line('example.com', key)}`).check('example.com', 22, key).status, 'revoked');
});

test('non standard ports use [host]:port', () => {
	const key = blob();
	const kh = new KnownHosts({ userFiles: [tmpFile(line('[example.com]:2222', key))], globalFiles: [] });
	assert.strictEqual(kh.check('example.com', 2222, key).status, 'known');
	assert.strictEqual(kh.check('example.com', 22, key).status, 'unknown');
});

test('hashed hosts, wildcards and negation', () => {
	const key = blob();
	const kh = (content) => new KnownHosts({ userFiles: [tmpFile(content)], globalFiles: [] });
	assert.strictEqual(kh(line(hashed('db.example.com'), key)).check('db.example.com', 22, key).status, 'known');
	assert.strictEqual(kh(line('*.example.com', key)).check('db.example.com', 22, key).status, 'known');
	assert.strictEqual(kh(line('*.example.com,!db.example.com', key)).check('db.example.com', 22, key).status, 'unknown');
	assert.strictEqual(kh(`# comment\n\n${line('db.example.com', key)}`).check('db.example.com', 22, key).status, 'known');
});

test('unknown hosts report the known key types', () => {
	const kh = new KnownHosts({ userFiles: [tmpFile('example.com ssh-rsa AAAA\n')], globalFiles: [] });
	assert.deepStrictEqual(kh.check('example.com', 22, blob()).knownTypes, ['ssh-rsa']);
});

test('add writes plain or hashed entries with private permissions', () => {
	const key = blob();
	const file = tmpFile('other.example.com ssh-rsa AAAA');
	new KnownHosts({ userFiles: [file], globalFiles: [] }).add('example.com', 2222, key);
	const lines = fs.readFileSync(file, 'utf8').split('\n');
	assert.strictEqual(lines[1], `[example.com]:2222 ssh-ed25519 ${key.toString('base64')}`);

	// a new file is created private, existing files keep their permissions (like OpenSSH)
	const hashedFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pma-kh-')), 'new', 'known_hosts');
	const kh = new KnownHosts({ userFiles: [hashedFile], globalFiles: [], hashHosts: true });
	kh.add('example.com', 22, key);
	assert.ok(fs.readFileSync(hashedFile, 'utf8').startsWith('|1|'));
	assert.strictEqual(kh.check('example.com', 22, key).status, 'known');
	assert.strictEqual(fs.statSync(hashedFile).mode & 0o777, 0o600);
});

test('preferred algorithms put known key types first', () => {
	const kh = new KnownHosts({ userFiles: [tmpFile('example.com ssh-rsa AAAA\n')], globalFiles: [] });
	const defaults = ['ssh-ed25519', 'ecdsa-sha2-nistp256', 'rsa-sha2-512', 'rsa-sha2-256', 'ssh-rsa'];
	assert.deepStrictEqual(kh.preferredAlgorithms('example.com', 22, defaults),
		['rsa-sha2-512', 'rsa-sha2-256', 'ssh-rsa', 'ssh-ed25519', 'ecdsa-sha2-nistp256']);
	assert.deepStrictEqual(kh.preferredAlgorithms('unknown.example.com', 22, defaults), defaults);
});
