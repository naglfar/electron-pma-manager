'use strict'

// Host key checking against OpenSSH known_hosts files

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const expandHome = (file) => file.startsWith('~/') ? path.join(os.homedir(), file.substring(2)) : file;

const defaultUserFiles = () => [
	path.join(os.homedir(), '.ssh', 'known_hosts'),
	path.join(os.homedir(), '.ssh', 'known_hosts2'),
];
const defaultGlobalFiles = () => [
	'/etc/ssh/ssh_known_hosts',
	'/etc/ssh/ssh_known_hosts2',
];

// "host" for port 22, "[host]:port" otherwise
const hostEntryName = (host, port) => port && port != 22 ? `[${host}]:${port}` : host;

// key type is the first string of the ssh wire format key blob
const keyType = (blob) => blob.subarray(4, 4 + blob.readUInt32BE(0)).toString();

const fingerprint = (blob) => 'SHA256:' + crypto.createHash('sha256').update(blob).digest('base64').replace(/=+$/, '');

// ssh-rsa host keys are used with the rsa-sha2 signature algorithms
const ALGORITHMS_BY_KEY_TYPE = {
	'ssh-rsa': ['rsa-sha2-512', 'rsa-sha2-256', 'ssh-rsa'],
};

const globToRegExp = (glob) => new RegExp('^' + glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');

// one host pattern of a known_hosts line, plain or hashed (|1|salt|hash)
const patternMatches = (pattern, name) => {
	if (pattern.startsWith('|1|')) {
		const [, , salt, hash] = pattern.split('|');
		const hmac = crypto.createHmac('sha1', Buffer.from(salt, 'base64')).update(name).digest('base64');
		return hmac === hash;
	}
	return globToRegExp(pattern).test(name);
};

// comma separated patterns, a matching negated pattern excludes the host
const hostsMatch = (hosts, name) => {
	let matched = false;
	for (const pattern of hosts.split(',')) {
		if (pattern.startsWith('!')) {
			if (patternMatches(pattern.substring(1), name)) return false;
		} else if (patternMatches(pattern, name)) {
			matched = true;
		}
	}
	return matched;
};

const parseLine = (line) => {
	const parts = line.trim().split(/\s+/);
	if (!parts[0] || parts[0].startsWith('#')) return null;
	const marker = parts[0].startsWith('@') ? parts.shift() : null;
	if (parts.length < 3) return null;
	return { marker, hosts: parts[0], type: parts[1], key: Buffer.from(parts[2], 'base64') };
};

class KnownHosts {
	// options from ssh config: UserKnownHostsFile, GlobalKnownHostsFile, HashKnownHosts
	constructor({ userFiles, globalFiles, hashHosts = false } = {}) {
		this.userFiles = (userFiles || defaultUserFiles()).map(expandHome);
		this.globalFiles = (globalFiles || defaultGlobalFiles()).map(expandHome);
		this.hashHosts = hashHosts;
	}

	entries(name) {
		const result = [];
		for (const file of [...this.userFiles, ...this.globalFiles]) {
			let content;
			try {
				content = fs.readFileSync(file, 'utf8');
			} catch (e) {
				continue;
			}
			for (const line of content.split('\n')) {
				const entry = parseLine(line);
				// @cert-authority is not supported
				if (entry && entry.marker !== '@cert-authority' && hostsMatch(entry.hosts, name)) {
					result.push(entry);
				}
			}
		}
		return result;
	}

	// returns { status: 'known' | 'unknown' | 'changed' | 'revoked', ... }
	check(host, port, blob) {
		const name = hostEntryName(host, port);
		const type = keyType(blob);
		const entries = this.entries(name);
		const info = { host: name, type, fingerprint: fingerprint(blob) };
		if (entries.some(e => e.marker === '@revoked' && e.key.equals(blob))) {
			return { ...info, status: 'revoked' };
		}
		const keys = entries.filter(e => !e.marker);
		if (keys.some(e => e.key.equals(blob))) {
			return { ...info, status: 'known' };
		}
		if (keys.some(e => e.type === type)) {
			return { ...info, status: 'changed' };
		}
		return { ...info, status: 'unknown', knownTypes: [...new Set(keys.map(e => e.type))] };
	}

	// signature algorithms with the already known key types first, like OpenSSH does
	preferredAlgorithms(host, port, defaults) {
		const known = this.entries(hostEntryName(host, port)).filter(e => !e.marker).map(e => e.type);
		const preferred = known.flatMap(type => ALGORITHMS_BY_KEY_TYPE[type] || [type]).filter(a => defaults.includes(a));
		return [...new Set([...preferred, ...defaults])];
	}

	add(host, port, blob) {
		const file = this.userFiles[0];
		let name = hostEntryName(host, port);
		if (this.hashHosts) {
			const salt = crypto.randomBytes(20);
			name = `|1|${salt.toString('base64')}|${crypto.createHmac('sha1', salt).update(name).digest('base64')}`;
		}
		fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
		let prefix = '';
		try {
			const content = fs.readFileSync(file, 'utf8');
			if (content && !content.endsWith('\n')) prefix = '\n';
		} catch (e) {
			// no file yet
		}
		fs.appendFileSync(file, `${prefix}${name} ${keyType(blob)} ${blob.toString('base64')}\n`, { mode: 0o600 });
	}
}

module.exports = { KnownHosts, fingerprint, keyType };
