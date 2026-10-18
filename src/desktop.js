// Open in Desktop App: a presentation of the user's in SlideLogic on this computer, through a
// `slidelogic://open?server=…&path=…` link. The desktop app signs in to this Nextcloud if it isn't
// yet (Login Flow), then opens the file in the same co-editing session as the browser.

import { getRootUrl } from '@nextcloud/router'

/** The link that opens `filePath` (relative to the user's files) in the desktop app. */
export function desktopLink(filePath) {
	const server = `${location.origin}${getRootUrl()}`
	return `slidelogic://open?server=${encodeURIComponent(server)}&path=${encodeURIComponent(filePath)}`
}

/** Opens `filePath` in the desktop app (the browser hands the link to it). */
export function openInDesktop(filePath) {
	location.href = desktopLink(filePath)
}
