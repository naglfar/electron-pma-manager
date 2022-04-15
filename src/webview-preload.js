const {ipcRenderer} = require('electron');

document.addEventListener('keydown', (e) => {
	if (e.ctrlKey && e.key == 'f') {
		ipcRenderer.sendToHost('webview-keypress', 'ctrl-f');
	}
});

window.addEventListener('load', () => {
	const style = document.createElement('style');
	style.innerText = `#pma_navigation_header { display: none; }`;
	// document.head.appendChild(style);
});