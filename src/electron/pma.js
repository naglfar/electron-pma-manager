'use strict'

// phpMyAdmin installation from the official release archives

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const util = require('util');
const execFile = util.promisify(require('child_process').execFile);
const tar = require('tar');
const { paths } = require('./paths');

const VERSION_URL = 'https://www.phpmyadmin.net/home_page/version.json';
const DOWNLOAD_URL = 'https://files.phpmyadmin.net/phpMyAdmin';

// files of this app copied into the phpMyAdmin directory
const EXTENSION_FILES = ['config.inc.php', 'pmadata.php'];
const extensionsDir = path.normalize(`${__dirname}/../pma`);

const isInstalled = () => fs.existsSync(path.join(paths.pma, 'index.php'));

const getInstalledVersion = () => {
	try {
		const releaseFile = fs.readdirSync(paths.pma).find(f => f.startsWith('RELEASE-DATE-'));
		return releaseFile ? releaseFile.substring('RELEASE-DATE-'.length) : null;
	} catch (e) {
		return null;
	}
};

const getLatestRelease = async () => {
	const res = await fetch(VERSION_URL);
	if (!res.ok) {
		throw new Error(`Fetching ${VERSION_URL} failed: ${res.status}`);
	}
	const data = await res.json();
	return data.releases.find(r => r.version == data.version) || data.releases[0];
};

// compare dotted version numbers, returns <0, 0, >0
const compareVersions = (a, b) => {
	const pa = String(a).split(/[.-]/).map(n => parseInt(n, 10) || 0);
	const pb = String(b).split(/[.-]/).map(n => parseInt(n, 10) || 0);
	for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
		const diff = (pa[i] || 0) - (pb[i] || 0);
		if (diff != 0) return diff;
	}
	return 0;
};

// constraint like ">=7.2,<8.4"
const satisfies = (version, constraint) => {
	return String(constraint || '').split(',').map(c => c.trim()).filter(c => c).every(c => {
		const [, op, v] = c.match(/^(>=|<=|>|<|=)?\s*(.+)$/);
		const cmp = compareVersions(version, v);
		switch (op) {
			case '>=': return cmp >= 0;
			case '<=': return cmp <= 0;
			case '>': return cmp > 0;
			case '<': return cmp < 0;
			default: return cmp == 0;
		}
	});
};

const getPHPVersion = async () => {
	const { stdout } = await execFile('php', ['-r', 'echo PHP_VERSION;']);
	return stdout.trim();
};

const checkUpdate = async () => {
	const installed = getInstalledVersion();
	const latest = await getLatestRelease();
	const phpVersion = await getPHPVersion();
	return {
		installed,
		latest: latest.version,
		updateAvailable: !installed || compareVersions(latest.version, installed) > 0,
		phpVersion,
		phpVersions: latest.php_versions,
		phpSupported: satisfies(phpVersion, latest.php_versions),
	};
};

const download = async (url, file, onProgress) => {
	const res = await fetch(url);
	if (!res.ok || !res.body) {
		throw new Error(`Download of ${url} failed: ${res.status}`);
	}
	const total = parseInt(res.headers.get('content-length'), 10) || 0;
	let received = 0;
	const hash = crypto.createHash('sha256');
	const body = Readable.fromWeb(res.body);
	body.on('data', (chunk) => {
		received += chunk.length;
		hash.update(chunk);
		if (onProgress && total) onProgress(received / total);
	});
	await pipeline(body, fs.createWriteStream(file));
	return hash.digest('hex');
};

const copyExtensions = (dir = paths.pma) => {
	EXTENSION_FILES.forEach(file => fs.copyFileSync(path.join(extensionsDir, file), path.join(dir, file)));
};

// copy extension files if they changed
const updateExtensions = () => {
	const hash = file => crypto.createHash('sha1').update(fs.readFileSync(file)).digest('base64');
	EXTENSION_FILES.forEach(file => {
		const src = path.join(extensionsDir, file);
		const dst = path.join(paths.pma, file);
		if (!fs.existsSync(dst) || hash(src) != hash(dst)) {
			fs.copyFileSync(src, dst);
		}
	});
};

// download, verify and unpack a release, then swap it with the current installation
// beforeSwap: e.g. stop the php server serving the current installation
const install = async (version, onProgress = () => {}, beforeSwap = async () => {}) => {
	const name = `phpMyAdmin-${version}-all-languages.tar.gz`;
	const url = `${DOWNLOAD_URL}/${version}/${name}`;
	const newDir = `${paths.pma}.new`;
	const oldDir = `${paths.pma}.old`;
	const archive = path.join(paths.userData, name);

	fs.mkdirSync(paths.userData, { recursive: true });
	fs.rmSync(newDir, { recursive: true, force: true });
	fs.rmSync(oldDir, { recursive: true, force: true });

	try {
		onProgress('Downloading', 0);
		const sha256 = await download(url, archive, p => onProgress('Downloading', p));

		const res = await fetch(`${url}.sha256`);
		if (!res.ok) {
			throw new Error(`Download of ${url}.sha256 failed: ${res.status}`);
		}
		const expected = (await res.text()).trim().split(/\s+/)[0].toLowerCase();
		if (expected != sha256) {
			throw new Error(`Checksum mismatch for ${name}`);
		}

		onProgress('Unpacking', 1);
		fs.mkdirSync(newDir);
		await tar.x({ file: archive, cwd: newDir, strip: 1 });
		copyExtensions(newDir);

		await beforeSwap();
		const hasOld = fs.existsSync(paths.pma);
		if (hasOld) {
			fs.renameSync(paths.pma, oldDir);
		}
		try {
			fs.renameSync(newDir, paths.pma);
		} catch (e) {
			if (hasOld) fs.renameSync(oldDir, paths.pma);
			throw e;
		}
		fs.rmSync(oldDir, { recursive: true, force: true });
	} finally {
		fs.rmSync(archive, { force: true });
		fs.rmSync(newDir, { recursive: true, force: true });
	}
};

module.exports = {
	isInstalled,
	getInstalledVersion,
	getLatestRelease,
	checkUpdate,
	install,
	updateExtensions,
};
