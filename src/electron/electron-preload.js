const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
	setTitle: (title) => ipcRenderer.send('set-title', title),
	newConnection: (connection) => ipcRenderer.invoke('new-connection', connection),
	saveConnection: (connection) => ipcRenderer.invoke('save-connection', connection),
	deleteConnection: (connectionId) => ipcRenderer.invoke('delete-connection', connectionId),
	getConnections: () => ipcRenderer.invoke('get-connections'),
	getTunnels: () => ipcRenderer.invoke('get-tunnels'),
	getSettings: () => ipcRenderer.invoke('get-settings'),
	saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
	getPMAOptions: () => ipcRenderer.invoke('get-pmaoptions'),
	getDirname: () => ipcRenderer.invoke('get-dirname'),
})