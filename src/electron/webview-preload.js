const {ipcRenderer} = require('electron');

document.addEventListener('keydown', (e) => {
	if (e.ctrlKey && e.key == 'f') {
		ipcRenderer.sendToHost('webview-keypress', 'ctrl-f');
	}
});

window.addEventListener('load', () => {
	const style = document.createElement('style');
	style.innerText = `
		#pma_navigation_header a { display: none; }
		#pma_navigation_header .ic_ajax_clock_small { position: absolute; top: 42px; left: 8px; }
		#pma_navigation_reload {
			display: block !important;
			position: absolute;
			right: 60px;
			top: 38px;
			z-index: 10;
		}
		.ic_s_collapseall {
			background-image: url("./themes/pmahomme/img/s_collapseall.png");
			background-position: center center;
			background-size: auto 100%;
			width: 22px;
		}
		.text-monospace {
			/* FIXME: monospace fonts not rendering in electron? */
			font-family: sans !important;
		}
	`;
	document.head.appendChild(style);
});