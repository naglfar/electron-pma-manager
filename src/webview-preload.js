const {ipcRenderer} = require('electron');

document.addEventListener('load', () => {
});
document.addEventListener('keydown', (e) => {
	// parent.window.postMessage('yolo');
	// console.log('yolo');
	// window.electronAPI.webviewKeypress();
	if (e.ctrlKey && e.key == 'f') {
		ipcRenderer.sendToHost('webview-keypress', 'ctrl-f');
	}
});