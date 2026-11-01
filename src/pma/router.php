<?php
declare(strict_types=1);

// Router of the PHP built-in server, runs before every request.
// Only electron-pma-manager knows the token of this run, other local processes are rejected.

$token = getenv('PMA_MANAGER_TOKEN');
if (!$token || !hash_equals($token, $_SERVER['HTTP_X_PMA_MANAGER_TOKEN'] ?? '')) {
	http_response_code(403);
	header('Content-Type: text/plain');
	echo "Forbidden\n";
	return true;
}

// serve the requested file or script
return false;
