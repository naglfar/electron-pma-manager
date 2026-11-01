'use strict'

// Minimal stand-in for a phpMyAdmin installation: its pages show what the php server received

const fs = require('fs');
const path = require('path');

const PAGE = `<?php
header('Content-Type: text/html');
$credentials = json_decode((string) base64_decode($_SERVER['HTTP_X_PMA_MANAGER_CREDENTIALS'] ?? ''), true);
$info = [
	'page' => basename($_SERVER['SCRIPT_NAME']),
	'colorScheme' => $_SERVER['HTTP_X_PMA_MANAGER_COLOR_SCHEME'] ?? null,
	'credentials' => $credentials,
	'db' => getenv('PMA_MANAGER_DB'),
];
echo '<!doctype html><title>fake pma</title><pre id="info">' . htmlspecialchars(json_encode($info)) . '</pre>';
`;

const create = (dir) => {
	fs.mkdirSync(path.join(dir, 'setup'), { recursive: true });
	fs.writeFileSync(path.join(dir, 'index.php'), PAGE);
	fs.writeFileSync(path.join(dir, 'setup', 'index.php'), PAGE);
	fs.writeFileSync(path.join(dir, 'pmadata.php'), `<?php echo json_encode(['languages' => [['key' => 'en', 'label' => 'English']], 'themes' => []]);`);
	fs.writeFileSync(path.join(dir, 'style.css'), 'body { color: red; }');
};

module.exports = { create };
