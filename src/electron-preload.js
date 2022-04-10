const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
	setTitle: (title) => ipcRenderer.send('set-title', title),
	newConnection: (host, connectionId) => ipcRenderer.invoke('new-connection', host, connectionId),
	getConnections: () => ipcRenderer.invoke('get-connections'),
	getTunnels: () => ipcRenderer.invoke('get-tunnels'),
})