<?php
declare(strict_types=1);

// Languages and themes of this phpMyAdmin installation for the settings dialog.
// Reads the installation's files and does not bootstrap phpMyAdmin, which changes between versions.

error_reporting(E_ALL & ~E_NOTICE & ~E_WARNING & ~E_DEPRECATED);

$root = __DIR__ . DIRECTORY_SEPARATOR;

// language names: phpMyAdmin's own table if available, else intl, else the code
$languageData = [];
try {
	require_once $root . 'vendor' . DIRECTORY_SEPARATOR . 'autoload.php';
	$property = new ReflectionProperty(\PhpMyAdmin\LanguageManager::class, 'languageData');
	if (PHP_VERSION_ID < 80100) {
		$property->setAccessible(true);
	}
	$languageData = $property->getValue();
} catch (\Throwable $e) {
}

$languageLabel = function (string $code) use ($languageData): string {
	$key = strtolower($code);
	if (isset($languageData[$key])) {
		// [code, english name, native name, ...]
		[, $english, $native] = $languageData[$key];
		return $native ? "$native - $english" : $english;
	}
	if (class_exists('Locale')) {
		$english = Locale::getDisplayName($code, 'en');
		$native = Locale::getDisplayName($code, $code);
		return $native && $native != $english ? "$native - $english" : $english;
	}
	return $code;
};

$languages = [['key' => 'en', 'label' => $languageLabel('en')]];
foreach (glob($root . 'locale/*/LC_MESSAGES/phpmyadmin.mo') ?: [] as $file) {
	$code = basename(dirname(dirname($file)));
	$languages[] = ['key' => $code, 'label' => $languageLabel($code)];
}
usort($languages, fn($a, $b) => strcasecmp(strip_tags(html_entity_decode($a['label'])), strip_tags(html_entity_decode($b['label']))));

$themes = [];
foreach (glob($root . 'themes/*/theme.json') ?: [] as $file) {
	$key = basename(dirname($file));
	$info = json_decode((string) file_get_contents($file), true);
	$themes[] = ['key' => $key, 'label' => $info['name'] ?? $key];
}
usort($themes, fn($a, $b) => strcmp($a['key'], $b['key']));

header('Content-Type: application/json');
echo json_encode(['languages' => $languages, 'themes' => $themes]);
