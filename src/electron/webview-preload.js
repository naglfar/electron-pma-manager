const {ipcRenderer} = require('electron');

// shortcuts of the tab bar also work while phpMyAdmin has the focus, see shortcuts.ts
const shortcut = (e) => {
	const key = e.key.toLowerCase();
	if (e.ctrlKey && !e.altKey && !e.shiftKey && key == 'f') return 'find';
	if (e.ctrlKey && !e.altKey && !e.shiftKey && key == 't') return 'new-tab';
	if (e.ctrlKey && !e.altKey && !e.shiftKey && key == 'w') return 'close-tab';
	if (e.ctrlKey && !e.altKey && key == 'tab') return e.shiftKey ? 'previous-tab' : 'next-tab';
	if (e.altKey && !e.ctrlKey && !e.shiftKey && /^[1-9]$/.test(e.key)) return `tab-${e.key}`;
	return null;
};
document.addEventListener('keydown', (e) => {
	const name = shortcut(e);
	if (name) {
		e.preventDefault();
		e.stopPropagation();
		ipcRenderer.sendToHost('shortcut', name);
	}
}, true);

window.addEventListener('load', () => {
	// mysql error 1045: the password was rejected, the tab bar may ask for it again
	if (/(HY000\/1045|#1045)/.test(document.body?.innerText || '')) {
		ipcRenderer.sendToHost('access-denied');
	}

	// const style = document.createElement('style');
	// style.innerText = `
	// 	#pma_navigation_header a { display: none; }
	// 	#pma_navigation_header .ic_ajax_clock_small { position: absolute; top: 42px; left: 8px; }
	// 	#pma_navigation_reload {
	// 		display: block !important;
	// 		position: absolute;
	// 		right: 60px;
	// 		top: 38px;
	// 		z-index: 10;
	// 	}
	// 	.ic_s_collapseall {
	// 		background-image: url("./themes/pmahomme/img/s_collapseall.png");
	// 		background-position: center center;
	// 		background-size: auto 100%;
	// 		width: 22px;
	// 	}
	// `;
	// document.head.appendChild(style);
});