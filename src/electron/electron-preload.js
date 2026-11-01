const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
	setTitle: (title) => ipcRenderer.send('set-title', title),
	newConnection: (connection, password) => ipcRenderer.invoke('new-connection', connection, password),
	closeConnection: (connectionId) => ipcRenderer.invoke('close-connection', connectionId),
	saveConnection: (connection) => ipcRenderer.invoke('save-connection', connection),
	deleteConnection: (connectionId) => ipcRenderer.invoke('delete-connection', connectionId),
	getConnections: () => ipcRenderer.invoke('get-connections'),
	getSettings: () => ipcRenderer.invoke('get-settings'),
	saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
	setUITheme: (theme) => ipcRenderer.invoke('set-ui-theme', theme),
	getPMAOptions: () => ipcRenderer.invoke('get-pmaoptions'),
	getPMAUrl: () => ipcRenderer.invoke('get-pma-url'),
	connectionNeedsPassword: (connectionId) => ipcRenderer.invoke('connection-needs-password', connectionId),
	pmaCheckUpdate: () => ipcRenderer.invoke('pma-check-update'),
	pmaUpdate: (version) => ipcRenderer.invoke('pma-update', version),
	onPMAUpdateProgress: (callback) => ipcRenderer.on('pma-update-progress', (event, data) => callback(data)),
	onPMAThemeChanged: (callback) => ipcRenderer.on('pma-theme-changed', (event, data) => callback(data)),
})