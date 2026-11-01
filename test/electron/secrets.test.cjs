'use strict'

const { test } = require('node:test');
const assert = require('node:assert');
const secrets = require('../../src/electron/secrets');

test('encrypt and decrypt', async () => {
	const encrypted = await secrets.encrypt('geheim');
	assert.ok(secrets.isEncrypted(encrypted));
	assert.ok(!encrypted.includes('geheim'));
	assert.strictEqual(await secrets.decrypt(encrypted), 'geheim');
	assert.strictEqual(await secrets.encrypt(encrypted), encrypted, 'not encrypted twice');
});

test('plain and empty values', async () => {
	assert.strictEqual(await secrets.encrypt(''), '');
	assert.strictEqual(await secrets.decrypt('plain'), 'plain', 'values of older versions');
	assert.strictEqual(await secrets.decrypt(null), '');
	assert.ok(await secrets.canDecrypt('plain'));
});

test('values that can not be decrypted', async () => {
	const broken = 'enc:' + Buffer.from('v11' + 'x'.repeat(40)).toString('base64');
	assert.strictEqual(await secrets.decrypt(broken), '');
	assert.strictEqual(await secrets.canDecrypt(broken), false);
	assert.strictEqual(await secrets.needsReEncrypt(broken), false);
});

test('storage backend', () => {
	// runner.cjs uses --password-store=basic
	assert.strictEqual(secrets.backend(), 'basic_text');
	assert.ok(secrets.isWeak());
});
