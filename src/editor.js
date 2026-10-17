// The editor page: SlideLogic runs in an iframe on this origin (`?host=parent&ack=1`). This page
// reads the presentation over WebDAV with the user's session, hands it to SlideLogic, and writes
// back what SlideLogic saves. Protocol: deckcraft/packaging/web/README.md ("Opening and saving
// through the page").

import { getCurrentUser, getRequestToken } from '@nextcloud/auth'
import { generateRemoteUrl } from '@nextcloud/router'

const root = document.getElementById('deckcraft-app')
const status = document.getElementById('deckcraft-status')
const notice = document.getElementById('deckcraft-notice')
const path = root?.dataset.path ?? ''
const user = getCurrentUser()

/** The folder of `path` and its file name. */
function split(p) {
	const i = p.lastIndexOf('/')
	return i < 0 ? ['', p] : [p.slice(0, i), p.slice(i + 1)]
}

const [folder, fileName] = split(path)

/** WebDAV URL of a path in the user's files. */
function davUrl(p) {
	const encoded = p.split('/').filter(Boolean).map(encodeURIComponent).join('/')
	return `${generateRemoteUrl(`dav/files/${encodeURIComponent(user.uid)}`)}/${encoded}`
}

function show(text, error = false) {
	status.textContent = text
	status.classList.toggle('error', error)
	status.hidden = false
}

let noticeTimer = 0
/** A short note over the editor (a copy saved, or why it wasn't). */
function note(text, error = false) {
	notice.textContent = text
	notice.classList.toggle('error', error)
	notice.hidden = false
	clearTimeout(noticeTimer)
	noticeTimer = setTimeout(() => {
		notice.hidden = true
	}, error ? 10000 : 4000)
}

/** Known ETags by path: the file opened, and files this page created. */
const etags = new Map()
let dirty = false
/** The presentation's current name (Nextcloud may have stored it under another). */
let shownName = fileName

function showTitle() {
	document.title = `${dirty ? '• ' : ''}${shownName} - SlideLogic`
}

function headers(extra = {}) {
	return { requesttoken: getRequestToken() ?? '', ...extra }
}

async function load(frame) {
	const response = await fetch(davUrl(path), { headers: headers(), credentials: 'same-origin' })
	if (!response.ok) {
		throw new Error(`${response.status} ${response.statusText}`)
	}
	const etag = response.headers.get('ETag')
	if (etag) {
		etags.set(path, etag)
	}
	// An empty file (one just made in Files) opens as a new blank presentation saved under its name.
	const bytes = await response.arrayBuffer()
	frame.contentWindow.postMessage({ type: 'deckcraft:open', name: fileName, bytes }, location.origin, [bytes])
	showTitle()
}

/** The file name `name` in the opened file's folder. */
function inFolder(name) {
	return folder ? `${folder}/${name}` : name
}

/**
 * PUT `bytes` to `target`: over the version this page knows, or only as a new file when it knows
 * none, so nothing this page didn't open or create is ever overwritten. Resolves to the response.
 */
async function put(target, bytes) {
	const known = etags.get(target)
	const condition = known ? { 'If-Match': known } : { 'If-None-Match': '*' }
	const response = await fetch(davUrl(target), {
		method: 'PUT',
		headers: headers(condition),
		credentials: 'same-origin',
		body: bytes,
	})
	if (response.ok) {
		const etag = response.headers.get('OC-ETag') ?? response.headers.get('ETag')
		if (etag) {
			etags.set(target, etag.startsWith('"') ? etag : `"${etag}"`)
		} else {
			etags.delete(target)
		}
	}
	return response
}

/** The last path component of a name SlideLogic sent ('' if none). */
function baseName(name) {
	return String(name ?? '').split(/[\\/]/).pop().trim()
}

/** Store the presentation SlideLogic saved. Resolves to the reply for SlideLogic. */
async function storePresentation(message) {
	const name = baseName(message.name)
	if (!name) {
		return { type: 'deckcraft:saveFailed', id: message.id, error: 'The presentation has no name.' }
	}
	const known = etags.has(inFolder(name))
	const response = await put(inFolder(name), message.bytes)
	if (response.status === 412) {
		const error = known
			? 'Someone else changed this file since you opened it. Use Save As to keep your changes under another name.'
			: `A file named ${name} already exists in this folder.`
		return { type: 'deckcraft:saveFailed', id: message.id, error }
	}
	if (!response.ok) {
		return { type: 'deckcraft:saveFailed', id: message.id, error: `Nextcloud answered ${response.status} ${response.statusText}.` }
	}
	shownName = name
	showTitle()
	return { type: 'deckcraft:saved', id: message.id, name }
}

/** `Talk.pdf` → `Talk (n).pdf`. */
function numbered(name, n) {
	const i = name.lastIndexOf('.')
	return i <= 0 ? `${name} (${n})` : `${name.slice(0, i)} (${n})${name.slice(i)}`
}

/**
 * Store a copy SlideLogic made (Save As, Export, Print) next to the presentation, as a new file: under
 * its own name, or the first free `name (n).ext`. A copy never replaces a file, the presentation
 * itself included (Save does that).
 */
async function storeCopy(message) {
	const name = baseName(message.name)
	if (!name) {
		note("Couldn't save the copy: it has no name.", true)
		return
	}
	for (let n = 1; n <= 50; n++) {
		const candidate = n === 1 ? name : numbered(name, n)
		if (etags.has(inFolder(candidate))) {
			continue
		}
		const response = await put(inFolder(candidate), message.bytes)
		if (response.ok) {
			note(`Saved ${candidate} in this folder.`)
			return
		}
		if (response.status !== 412) {
			note(`Couldn't save ${candidate}: Nextcloud answered ${response.status} ${response.statusText}.`, true)
			return
		}
	}
	note(`Couldn't save ${name}: too many files with that name in this folder.`, true)
}

function start() {
	if (!root || !status || !notice) {
		return
	}
	if (!user) {
		show('Sign in to Nextcloud to open files in SlideLogic.', true)
		return
	}
	if (!path) {
		show('No file to open. Open a presentation from Files with "Open in SlideLogic".', true)
		return
	}
	if (root.dataset.editorMissing === '1') {
		show("The SlideLogic editor isn't installed in this app yet (see editor/README.md in the app).", true)
		return
	}
	const editorUrl = new URL(root.dataset.editorUrl, location.href)
	// Added to the page's own query (`v`, the app version), which keeps browser caches current.
	for (const [key, value] of Object.entries({ host: 'parent', ack: '1', author: user.displayName ?? user.uid })) {
		editorUrl.searchParams.set(key, value)
	}

	const frame = document.createElement('iframe')
	frame.title = 'SlideLogic presentation'
	// Slide shows go full screen.
	frame.allow = 'fullscreen; clipboard-read; clipboard-write'
	frame.allowFullscreen = true
	let opened = false

	addEventListener('message', async (event) => {
		if (event.origin !== location.origin || event.source !== frame.contentWindow) {
			return
		}
		const message = event.data ?? {}
		switch (message.type) {
		case 'deckcraft:ready':
			if (opened) {
				return
			}
			opened = true
			if (!message.ack) {
				console.warn('SlideLogic: this build does not confirm saves; a failed save will not be reported')
			}
			try {
				await load(frame)
				status.hidden = true
			} catch (e) {
				show(`Couldn't open ${fileName}: ${e.message}`, true)
			}
			break
		case 'deckcraft:save':
			if (message.copy) {
				try {
					await storeCopy(message)
				} catch (e) {
					note(`Couldn't reach Nextcloud: ${e.message}`, true)
				}
				break
			}
			{
				let reply
				try {
					reply = await storePresentation(message)
				} catch (e) {
					reply = { type: 'deckcraft:saveFailed', id: message.id, error: `Couldn't reach Nextcloud: ${e.message}` }
				}
				// Without `id` (a build that doesn't wait for answers) there is nothing to answer.
				if (message.id !== undefined) {
					frame.contentWindow.postMessage(reply, location.origin)
				}
			}
			break
		case 'deckcraft:dirty':
			dirty = Boolean(message.dirty)
			showTitle()
			break
		case 'deckcraft:failed':
			show(`SlideLogic couldn't start: ${message.error}`, true)
			break
		}
	})

	addEventListener('beforeunload', (event) => {
		if (dirty) {
			event.preventDefault()
		}
	})

	frame.src = editorUrl.toString()
	root.appendChild(frame)
}

start()
