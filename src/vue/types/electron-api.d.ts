// api of src/electron/electron-preload.js, only available inside electron

// values are stored as text, the settings dialog uses booleans for checkboxes
declare type Settings = { [key: string]: string | boolean | undefined };

declare type PMAOptions = { [key: string]: Array<PMAOption> };

declare type PMAUpdateInfo = {
	installed: string | null,
	latest: string,
	updateAvailable: boolean,
	phpVersion: string,
	phpVersions: string,
	phpSupported: boolean,
};

declare interface ElectronAPI {
	setTitle(title: string): void;
	// returns the phpMyAdmin server index, password for "ask on connect" connections
	newConnection(connection: { id: number }, password?: string): Promise<number>;
	closeConnection(connectionId: number): Promise<void>;
	saveConnection(connection: Connection): Promise<unknown>;
	deleteConnection(connectionId: number): Promise<unknown>;
	getConnections(): Promise<Array<Connection>>;
	connectionNeedsPassword(connectionId: number): Promise<boolean>;
	// the password of an open connection was rejected, the next newConnection asks again
	forgetPassword(connectionId: number): Promise<void>;
	getSettings(): Promise<Settings>;
	saveSettings(settings: Settings): Promise<void>;
	setUITheme(theme: string): Promise<void>;
	getPMAOptions(): Promise<PMAOptions>;
	getPMAUrl(): Promise<string>;
	pmaCheckUpdate(): Promise<PMAUpdateInfo>;
	pmaUpdate(version: string): Promise<PMAOptions>;
	onPMAUpdateProgress(callback: (data: { step: string, progress: number }) => void): void;
	onPMAThemeChanged(callback: (data: { reloadActive: boolean }) => void): void;
	// the php server moved to another port
	onPMAUrlChanged(callback: (url: string) => void): void;
}

declare interface Window {
	electronAPI?: ElectronAPI;
}
