// Keyboard shortcuts of the tab bar. The same mapping is in src/electron/webview-preload.js
// for key presses inside phpMyAdmin, keep both in sync.
// Alt+1..9 to switch tabs as usual on KDE Plasma (Alt+9: last tab).

export type Shortcut = 'find' | 'new-tab' | 'close-tab' | 'next-tab' | 'previous-tab' | `tab-${number}`;

export const shortcutOf = (e: KeyboardEvent): Shortcut | null => {
	const key = e.key.toLowerCase();
	if (e.ctrlKey && !e.altKey && !e.shiftKey && key == 'f') return 'find';
	if (e.ctrlKey && !e.altKey && !e.shiftKey && key == 't') return 'new-tab';
	if (e.ctrlKey && !e.altKey && !e.shiftKey && key == 'w') return 'close-tab';
	if (e.ctrlKey && !e.altKey && key == 'tab') return e.shiftKey ? 'previous-tab' : 'next-tab';
	if (e.altKey && !e.ctrlKey && !e.shiftKey && /^[1-9]$/.test(e.key)) return `tab-${Number(e.key)}`;
	return null;
};
