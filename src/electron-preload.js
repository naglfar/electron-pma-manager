const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
	setTitle: (title) => ipcRenderer.send('set-title', title),
	newConnection: (host, connectionId) => ipcRenderer.invoke('new-connection', host, connectionId),
	saveConnection: (connection) => ipcRenderer.invoke('save-connection', connection),
	deleteConnection: (connectionId) => ipcRenderer.invoke('delete-connection', connectionId),
	getConnections: () => ipcRenderer.invoke('get-connections'),
	getTunnels: () => ipcRenderer.invoke('get-tunnels'),
})