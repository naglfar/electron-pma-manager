<?php
declare(strict_types=1);

// TODO: restrict access to client via key in db

$settings = [];
try {
	// paths are passed by the electron process
	$db = new SQLite3(getenv('PMA_MANAGER_DB') ?: '../db.sqlite', SQLITE3_OPEN_READONLY);
	$res = $db->query('SELECT * FROM settings');
	while($row = $res->fetchArray()) {
		$settings[$row['key']] = $row['value'];
	}

	$res = $db->query('SELECT * FROM tunnels t LEFT JOIN connections c ON t.connection = c.id');
	while($row = $res->fetchArray()) {
		// server index is the connection id, used by the tabs
		$i = (int) $row['connection'];
		$cfg['Servers'][$i]['verbose'] = $row['name'];
		$cfg['Servers'][$i]['auth_type'] = 'config';
		$cfg['Servers'][$i]['host'] = '127.0.0.1';
		$cfg['Servers'][$i]['port'] = $row['port'];
		$cfg['Servers'][$i]['user'] = $row['mysql_user'] ?: 'root';
		$cfg['Servers'][$i]['password'] = $row['mysql_password'] ?: '';
		$cfg['Servers'][$i]['compress'] = true;
		$cfg['Servers'][$i]['AllowNoPassword'] = true;

		if (!empty($settings['usecontrol'])) {
			$cfg['Servers'][$i]['controlhost'] = $settings['controlhost'] ?: 'localhost';
			$cfg['Servers'][$i]['controlport'] = $settings['controlport'] ?: 3306;
			$cfg['Servers'][$i]['controluser'] = $settings['controluser'] ?: 'root';
			$cfg['Servers'][$i]['controlpass'] = $settings['controlpass'] ?: '';
			$cfg['Servers'][$i]['pmadb'] = $settings['pmadb'] ?: 'phpmyadmin';
			$cfg['Servers'][$i]['control_AllowNoPassword'] = true;
		}
	}
} catch(\Throwable $e) {

}

// defaults

if (getenv('PMA_MANAGER_TMP')) {
	$cfg['TempDir'] = getenv('PMA_MANAGER_TMP');
}
if (getenv('PMA_MANAGER_SECRET')) {
	$cfg['blowfish_secret'] = hex2bin(getenv('PMA_MANAGER_SECRET'));
}

$cfg['NavigationDisplayServers'] = false;

$cfg['Lang'] = $settings['language'] ?: 'en';

$cfg['ThemeManager'] = false;
$cfg['ThemeDefault'] = $settings['theme'] ?: 'pmahomme';

$cfg['MaxNavigationItems'] = 1000;
$cfg['MaxDbList'] = 100;
$cfg['MaxTableList'] = 1000;
$cfg['MaxRows'] = 500;
$cfg['ShowAll'] = true;
$cfg['ExecTimeLimit'] = 0;
$cfg['AllowUserDropDatabase'] = true;

$cfg['NavigationTreeEnableGrouping'] = false;
$cfg['NavigationDisplayLogo'] = false;
$cfg['NavigationTreeDisplayItemFilterMinimum'] = 10;
$cfg['NavigationTreeDisplayDbFilterMinimum'] = 10;

$cfg['DefaultTabTable'] = 'browse';
$cfg['NavigationTreeDefaultTabTable'] = 'search';

$cfg['ShowAll'] = true;

$cfg['RowActionLinksWithoutUnique'] = true;
$cfg['TablePrimaryKeyOrder'] = 'ASC';
$cfg['CharEditing'] = 'textarea';

$cfg['UploadDir'] = '';
$cfg['SaveDir'] = '';

$cfg['RepeatCells'] = 100;

$cfg['InitialSlidersState'] = 'open';

$cfg['UserprefsDisallow'] = [];
$cfg['UserprefsDeveloperTab'] = true;

// merge user defined settings
foreach($settings as $key => $value) {
	if (strpos($key, 'pma.') === 0) {
		$key = substr($key, 4);
		if (is_numeric($key)) { continue; }
		$cfg[$key] = $value;
	}
}