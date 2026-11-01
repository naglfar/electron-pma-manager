'use strict'

// themes installed with phpMyAdmin, see src/electron/pma.js

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const pma = require('../../src/electron/pma');

const pmaDir = () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pma-themes-'));
	fs.mkdirSync(path.join(dir, 'themes'));
	return dir;
};

test('a tampered archive is rejected', async () => {
	const dir = pmaDir();
	const originalFetch = global.fetch;
	const errors = [];
	const originalError = console.error;
	global.fetch = async () => new Response(Buffer.from('not the archive'));
	console.error = (...args) => errors.push(args.join(' '));
	try {
		await pma.installThemes(dir);
	} finally {
		global.fetch = originalFetch;
		console.error = originalError;
	}
	assert.deepStrictEqual(fs.readdirSync(path.join(dir, 'themes')), [], 'nothing installed, no leftovers');
	assert.match(errors.join('\n'), /Checksum mismatch/);
});

// downloads from files.phpmyadmin.net
test('install the pinned themes', { skip: !process.env.PMA_TEST_NETWORK && 'set PMA_TEST_NETWORK=1' }, async () => {
	const dir = pmaDir();
	await pma.installThemes(dir);
	const info = JSON.parse(fs.readFileSync(path.join(dir, 'themes', 'boodark', 'theme.json'), 'utf8'));
	assert.strictEqual(info.version, '1.2.0');
	assert.ok(fs.existsSync(path.join(dir, 'themes', 'boodark', 'css', 'theme.css')));

	// installed themes are not downloaded again
	const originalFetch = global.fetch;
	global.fetch = () => assert.fail('no download expected');
	try {
		await pma.installThemes(dir);
	} finally {
		global.fetch = originalFetch;
	}
});
