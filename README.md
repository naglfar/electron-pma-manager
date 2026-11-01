# electron-pma-manager

Electron wrapper for phpMyAdmin.

- several phpMyAdmin sessions in tabs, one per connection
- Vue 3 interface for managing connections and settings
- SSH tunnels using `~/.ssh/config`, ssh-agent and `known_hosts`
- phpMyAdmin is downloaded and updated by the app, light and dark theme follow the UI
- passwords are stored encrypted in the system keychain

## Requirements

- **PHP** in the `PATH`, with the extensions `mysqli`, `mbstring`, `sqlite3` and `openssl`.
  phpMyAdmin runs on PHP's built-in web server.
- **Linux**: a [Secret Service](https://specifications.freedesktop.org/secret-service/) provider for the
  password encryption, e.g. KeePassXC, GNOME Keyring or KWallet. Without one, Electron falls back to a
  hardcoded key (logged at startup as `weak encryption`). Another backend can be chosen with
  `--password-store=…`.
- **Node.js** and npm for development.

## Development

```bash
npm install
npm run dev
```

`npm run dev` starts the Vite dev server and Electron; closing Electron stops Vite.
`npm run vite` and `npm run electron` start them separately.

| Script | |
|---|---|
| `npm run dev` | Vite and Electron together |
| `npm run build` | type check, UI build, packages with electron-builder |
| `npm run build-electron:dir` | unpacked build in `dist-build/` |
| `npm run lint` | ESLint |
| `npm test` | all tests, see [Tests](#tests) |

On the first start the app asks to download phpMyAdmin.

## Usage

| Shortcut | |
|---|---|
| Ctrl+T | open a connection |
| Ctrl+W | close tab |
| Ctrl+Tab, Ctrl+Shift+Tab | next / previous tab |
| Alt+1 … Alt+8, Alt+9 | tab 1 … 8, last tab |
| Ctrl+F | search in the tab |

Tabs can be reordered by dragging, the middle mouse button closes them.
Pages phpMyAdmin opens in a new window (e.g. print views) get a window of their own,
links leaving phpMyAdmin open in the browser.

A connection's **MySQL host** is seen from the SSH host when an SSH tunnel host is set, e.g. a database
server in a private network behind it. With **Ask on connect** the password is asked for when the
connection is opened and kept in memory until its last tab is closed; a rejected password is asked again.

## Data

On Linux the app follows the XDG base directories:

| | |
|---|---|
| `$XDG_DATA_HOME/electron-pma-manager` (`~/.local/share/…`) | `db.sqlite` (connections, settings), `phpMyAdmin/`, `settings.json` (window state) |
| `$XDG_CACHE_HOME/electron-pma-manager` (`~/.cache/…`) | Chromium caches, phpMyAdmin's temp directory |

Other platforms use Electron's default user data directory. Data of the former app name
`pma-electron-vue` is copied on the first start.

## Security

- **phpMyAdmin is only reachable by the app.** `src/pma/router.php` runs before every request of the PHP
  server and rejects requests without the random token of the current run, which the app adds to the
  requests of its webviews. Other local programs and users get `403`.
- **Passwords** of connections and the control user are encrypted with Electron's `safeStorage`
  (system keychain). Decrypted they only exist in memory and reach phpMyAdmin as a request header.
- **Webviews** run in a session of their own, sandboxed with context isolation; preload script, partition
  and allowed URLs are set by the main process.
- **SSH host keys** are checked against `known_hosts` like OpenSSH does (`StrictHostKeyChecking`,
  `UserKnownHostsFile`, `HashKnownHosts`); unknown hosts are asked for, changed keys are rejected.

## Project structure

```
src/electron/   main process: window, IPC, php server, tunnels, phpMyAdmin installation, security
src/pma/        files copied into phpMyAdmin: config.inc.php, pmadata.php; router.php of the php server
src/vue/        UI
scripts/        development scripts
test/node/      tests running in Node.js
test/electron/  tests running in Electron's main process (windows stay hidden)
```

## Tests

```bash
npm test
```

- `npm run test:node`: tunnels and host keys against an SSH server in the test process, `known_hosts`
  parsing, `config.inc.php` via the PHP CLI.
- `npm run test:electron`: PHP server and router, webview session, password encryption, app state,
  theme installation. Uses temporary directories and `--password-store=basic`, the keychain is not used.
  `electron test/electron/runner.cjs <name>` runs single files.
- `PMA_TEST_NETWORK=1 npm test` also downloads the bundled third party themes.

## Third party

- [phpMyAdmin](https://www.phpmyadmin.net/) is downloaded from phpmyadmin.net (GPL-2.0).
- The dark phpMyAdmin theme [BooDark](https://github.com/adorade/boodark) (MIT) is installed with it.
