// Files app: an "Open in SlideLogic" action on presentations, the default (click to open) for them.

import { DefaultType, Permission, registerFileAction } from '@nextcloud/files'
import { generateUrl } from '@nextcloud/router'

/** PowerPoint presentations, templates and shows, and SlideLogic's own format: saved back as they are. */
const PRESENTATIONS = ['pptx', 'potx', 'ppsx', 'deckcraft']

// A monochrome glyph of the SlideLogic icon ("Banded slide"): a slide with a header band and an S trace.
const ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="2.5" y="4.5" width="19" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path fill="currentColor" d="M2.5 6.5a2 2 0 0 1 2-2h15a2 2 0 0 1 2 2V8h-19z"/><path d="M13.6 10.3a2 1.6 0 1 0-1.6 2.5 2.2 1.7 0 1 1-1.7 2.8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="8" cy="20.5" r="0.9" fill="currentColor"/><circle cx="12" cy="20.5" r="0.9" fill="currentColor"/><circle cx="16" cy="20.5" r="0.9" fill="currentColor"/></svg>'

function extension(node) {
	const name = node.basename ?? ''
	const i = name.lastIndexOf('.')
	return i < 0 ? '' : name.slice(i + 1).toLowerCase()
}

/** Whether `node` is a presentation SlideLogic opens that the user can read. */
function opens(node) {
	return node.type === 'file' && PRESENTATIONS.includes(extension(node)) && (node.permissions & Permission.READ) !== 0
}

registerFileAction({
	id: 'deckcraft-open',
	displayName: () => 'Open in SlideLogic',
	iconSvgInline: () => ICON,
	enabled: ({ nodes }) => nodes.length === 1 && opens(nodes[0]),
	async exec({ nodes }) {
		const url = new URL(generateUrl('/apps/deckcraft/edit'), location.href)
		url.searchParams.set('path', nodes[0].path)
		window.location.assign(url.toString())
		return null
	},
	order: -10,
	default: DefaultType.DEFAULT,
})
