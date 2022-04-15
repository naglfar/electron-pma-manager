<?php
define('ROOT_PATH', __DIR__ . DIRECTORY_SEPARATOR);
define('PHPMYADMIN', true);
require_once(ROOT_PATH . 'libraries/vendor_config.php');
require_once(AUTOLOAD_FILE);

define('PMA_VERSION', \PhpMyAdmin\Version::VERSION);
define('PMA_MAJOR_VERSION', \PhpMyAdmin\Version::SERIES);

error_reporting(E_ALL & ~E_NOTICE & ~E_WARNING);

$available_languages = \PhpMyAdmin\LanguageManager::getInstance()->availableLanguages();
$languages = [];
foreach($available_languages as $l) {
	$languages[] = ['key' => $l->getCode(), 'label' => $l->getName() ];
}
// $languages = array_map(function($l) {
// 	return ['code' => $l->getCode(), 'label' => $l->getName() ];
// }, $available_languages);

$themes = [];
$themesPath = \PhpMyAdmin\ThemeManager::getThemesFsDir();
$themesPathUrl = \PhpMyAdmin\ThemeManager::getThemesDir();
$handleThemes = opendir($themesPath);
if ($handleThemes) {

	$themeObjects = [];

	// check for themes directory
	while (($PMA_Theme = readdir($handleThemes)) !== false) {
		// Skip non dirs, . and ..
		if ($PMA_Theme === '.'
			|| $PMA_Theme === '..'
			|| ! @is_dir($themesPath . $PMA_Theme)
		) {
			continue;
		}
		if (array_key_exists($PMA_Theme, $themeObjects)) {
			continue;
		}
		$new_theme = \PhpMyAdmin\Theme::load(
			$themesPathUrl . $PMA_Theme,
			$themesPath . $PMA_Theme . DIRECTORY_SEPARATOR
		);
		if (!$new_theme) {
			continue;
		}

		// $new_theme->setId($PMA_Theme);
		$themeObjects[$PMA_Theme] = $new_theme;
	}
	closedir($handleThemes);

	ksort($themeObjects);
	foreach($themeObjects as $key => $theme) {
		$themes[] = ['key' => $key, 'label' => $theme->name];
	}
}

echo json_encode(['languages' => $languages, 'themes' => $themes]);