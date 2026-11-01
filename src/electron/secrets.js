'use strict'

// Encryption of stored passwords with the os keychain (safeStorage).
// Encrypted values are prefixed, older plain text values still work and are migrated.

const { app, safeStorage } = require('electron');

const PREFIX = 'enc:';

// linux: use the freedesktop secret service (KeePassXC, GNOME Keyring, KWallet's compatibility api).
// electron otherwise picks kwallet on KDE and silently falls back to a hardcoded key without it.
// must be set before the app is ready, --password-store on the command line still wins
if (process.platform == 'linux' && !app.commandLine.hasSwitch('password-store')) {
	app.commandLine.appendSwitch('password-store', 'gnome-libsecret');
}

const isEncrypted = (value) => typeof value == 'string' && value.startsWith(PREFIX);

const encrypt = async (value) => {
	if (!value || isEncrypted(value) || !await safeStorage.isAsyncEncryptionAvailable()) {
		return value;
	}
	return PREFIX + (await safeStorage.encryptStringAsync(value)).toString('base64');
};

const decrypt = async (value) => {
	if (!isEncrypted(value)) {
		return value || '';
	}
	try {
		const { result } = await safeStorage.decryptStringAsync(Buffer.from(value.substring(PREFIX.length), 'base64'));
		return result;
	} catch (e) {
		// e.g. keychain changed or locked, see canDecrypt
		console.error('Decrypting a password failed:', e.message);
		return '';
	}
};

// encrypted with an outdated or weak key (e.g. before the keychain was available)
const needsReEncrypt = async (value) => {
	if (!isEncrypted(value)) {
		return false;
	}
	try {
		const { shouldReEncrypt } = await safeStorage.decryptStringAsync(Buffer.from(value.substring(PREFIX.length), 'base64'));
		return !!shouldReEncrypt;
	} catch (e) {
		return false;
	}
};

// encrypted values never hold an empty password, an empty result means decrypting failed
const canDecrypt = async (value) => !isEncrypted(value) || (await decrypt(value)) !== '';

// linux without secret service: electron falls back to a hardcoded key
const backend = () => safeStorage.getSelectedStorageBackend?.() || process.platform;
const isWeak = () => backend() == 'basic_text';

module.exports = { encrypt, decrypt, canDecrypt, needsReEncrypt, isEncrypted, backend, isWeak };
