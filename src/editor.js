// The editor page: SlideLogic runs in an iframe on this origin (`?host=parent&ack=1`). This page
// reads the presentation over WebDAV with the user's session, hands it to SlideLogic, and writes
// back what SlideLogic saves. Protocol: deckcraft/packaging/web/README.md ("Opening and saving
// through the page", "Co-editing").
//
// A presentation in a format SlideLogic saves in place is co-edited: everyone with it open edits
// the same presentation (collab.js), and Save writes it as everyone has it.
//
// The same page serves shared links (`/s/{token}`, `data-share-token`): the file is then the
// link's own WebDAV address (a link to a folder: the presentation's address in it,
// `data-share-path`), and the person is a guest under the name they gave Nextcloud.

import { getCurrentUser, getGuestNickname, getRequestToken } from '@nextcloud/auth'
import { generateRemoteUrl, generateUrl, getRootUrl } from '@nextcloud/router'

import { Collab, colorFor } from './collab.js'

const root = document.getElementById('deckcraft-app')
const status = document.getElementById('deckcraft-status')
const notice = document.getElementById('deckcraft-notice')
const path = root?.dataset.path ?? ''
const fileId = Number(root?.dataset.fileId ?? 0)
/** A shared link's token: the page is the link's. */
const token = root?.dataset.shareToken ?? ''
const viaLink = token !== ''
/** Through a link to a folder: the presentation's path in it (`/Talks/Talk.pptx`). */
const sharePath = root?.dataset.sharePath ?? ''
/** Whether the link lets people edit (signed-in users: Nextcloud decides on each save). */
const linkCanEdit = root?.dataset.canEdit === '1'
const user = getCurrentUser()
/** How the others see this person. */
const personName = user?.displayName || user?.uid || getGuestNickname() || 'Guest'

/** The folder of `path` and its file name. */
function split(p) {
	const i = p.lastIndexOf('/')
	return i < 0 ? ['', p] : [p.slice(0, i), p.slice(i + 1)]
}

const [folder, fileName] = viaLink ? ['', root?.dataset.fileName ?? ''] : split(path)

/** Formats SlideLogic saves a presentation in as it is (anything else is saved as .pptx). */
const SAVES_IN_PLACE = ['pptx', 'potx', 'ppsx', 'deckcraft']

/** The extension of a file name, lower-case ('' if none). */
function extensionOf(name) {
	const i = name.lastIndexOf('.')
	return i < 0 ? '' : name.slice(i + 1).toLowerCase()
}

/** Whether the opened file is co-edited: everyone's edits are saved back into it. */
const coEdits = SAVES_IN_PLACE.includes(extensionOf(fileName))

/** Whether SlideLogic is saving the opened file itself (not a copy under another name). */
function isOpenedFile(name) {
	return String(name ?? '').split(/[\\/]/).pop().toLowerCase() === fileName.toLowerCase()
}

/** WebDAV URL of a path in the user's files; through a link, the shared presentation's. */
function davUrl(p) {
	if (viaLink) {
		const inFolder = sharePath.split('/').filter(Boolean).map(encodeURIComponent).join('/')
		return `${getRootUrl()}/public.php/dav/files/${encodeURIComponent(token)}${inFolder ? `/${inFolder}` : ''}`
	}
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

/** The co-editing session, once joined. */
let collab = null
/** How many others are in it. */
let others = 0

function showTitle() {
	const unsaved = collab ? collab.unsaved : dirty
	const company = others > 0 ? ` (${others + 1} editing)` : ''
	document.title = `${unsaved ? '• ' : ''}${shownName}${company} - SlideLogic`
}

function headers(extra = {}) {
	// X-Requested-With: a link's WebDAV answers a missing password with 401, not a login prompt.
	return { requesttoken: getRequestToken() ?? '', 'X-Requested-With': 'XMLHttpRequest', ...extra }
}

async function load(frame) {
	const response = await fetch(davUrl(path), { headers: headers(), credentials: 'same-origin', cache: 'no-store' })
	if (!response.ok) {
		throw new Error(`${response.status} ${response.statusText}`)
	}
	const etag = response.headers.get('ETag')
	if (etag) {
		etags.set(inFolder(fileName), etag)
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
	if (viaLink && !linkCanEdit) {
		return { type: 'deckcraft:saveFailed', id: message.id, error: 'This link lets you view the presentation, not change it. Download a copy to keep your changes.' }
	}
	if (viaLink && name !== fileName) {
		return { type: 'deckcraft:saveFailed', id: message.id, error: `This link can only save ${fileName}. Download a copy to keep it under another name.` }
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
	if (viaLink) {
		// A link reaches only the shared presentation: the copy is downloaded instead.
		download(name, message.bytes)
		note(`Downloaded ${name}.`)
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

/** Has the browser save `bytes` as `name`. */
function download(name, bytes) {
	const url = URL.createObjectURL(new Blob([bytes]))
	const a = Object.assign(document.createElement('a'), { href: url, download: name, hidden: true })
	document.body.append(a)
	a.click()
	a.remove()
	setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

function start() {
	if (!root || !status || !notice) {
		return
	}
	if (!user && !viaLink) {
		show('Sign in to Nextcloud to open files in SlideLogic.', true)
		return
	}
	if (!path && !viaLink) {
		show('No file to open. Open a presentation from Files with "Open in SlideLogic".', true)
		return
	}
	if (root.dataset.editorMissing === '1') {
		show("The SlideLogic editor isn't installed in this app yet (see editor/README.md in the app).", true)
		return
	}
	const editorUrl = new URL(root.dataset.editorUrl, location.href)
	// Added to the page's own query (`v`, the app version), which keeps browser caches current.
	for (const [key, value] of Object.entries({ host: 'parent', ack: '1', author: personName })) {
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
				if (message.collab && fileId > 0 && coEdits) {
					await share(frame)
				} else {
					await load(frame)
				}
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
					// Shared: Save writes the presentation as everyone has it.
					if (collab && isOpenedFile(message.name) && !collab.canEdit) {
						reply = { type: 'deckcraft:saveFailed', id: message.id, error: 'You can view this presentation but not change it. Download a copy to keep it.' }
					} else if (collab && isOpenedFile(message.name)) {
						await collab.checkpoint()
						reply = { type: 'deckcraft:saved', id: message.id }
						showTitle()
					} else {
						reply = await storePresentation(message)
					}
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
		case 'deckcraft:collab:op':
			collab?.queue(message.json)
			showTitle()
			break
		case 'deckcraft:collab:checkpointData':
			collab?.received(message)
			break
		case 'deckcraft:collab:selection':
			collab?.setSelection(message.json)
			break
		case 'deckcraft:collab:error':
			console.warn('SlideLogic co-editing:', message.error)
			collab?.rejoin()
			break
		case 'deckcraft:failed':
			show(`SlideLogic couldn't start: ${message.error}`, true)
			break
		}
	})

	addEventListener('beforeunload', (event) => {
		if (collab ? collab.unsaved : dirty) {
			event.preventDefault()
		}
	})

	frame.src = editorUrl.toString()
	root.appendChild(frame)
}

/** Who's editing, above the editor: each person in the colour they're drawn in on the slides. */
function showPeople(members) {
	let strip = document.getElementById('deckcraft-people')
	if (!strip) {
		strip = document.createElement('div')
		strip.id = 'deckcraft-people'
		strip.setAttribute('aria-label', "Who's editing")
		root.prepend(strip)
	}
	const me = collab?.client
	const sorted = [...members].sort((a, b) => (a.client === me ? -1 : b.client === me ? 1 : a.client - b.client))
	const key = JSON.stringify(sorted.map((m) => [m.client, m.displayName, m.canEdit]))
	if (strip.dataset.key === key) {
		return
	}
	strip.dataset.key = key
	strip.replaceChildren(
		Object.assign(document.createElement('span'), { className: 'label', textContent: sorted.length > 1 ? 'Editing now:' : 'Only you are editing' }),
	)
	if (sorted.length < 2) {
		return
	}
	for (const m of sorted) {
		const name = m.displayName || m.userId
		const shown = `${name}${m.client === me ? ' (you)' : ''}${m.canEdit === false ? ' (viewing)' : ''}`
		const chip = document.createElement('span')
		chip.className = 'person'
		chip.style.setProperty('--person', colorFor(m.client))
		chip.title = shown
		const initials = Object.assign(document.createElement('span'), { className: 'initials', textContent: initialsOf(name) })
		chip.append(initials, document.createTextNode(shown))
		strip.append(chip)
	}
}

function initialsOf(name) {
	const parts = String(name).trim().split(/\s+/).filter(Boolean)
	return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

/** Opens the file in a co-editing session: everyone with it open edits the same presentation. */
async function share(frame) {
	collab = new Collab({
		frame,
		fileId,
		fileUrl: davUrl(path),
		headers,
		notify: note,
		endpoint: viaLink ? generateUrl(`/apps/deckcraft/s/${encodeURIComponent(token)}/collab`) : generateUrl('/apps/deckcraft/collab'),
		joinParams: viaLink ? { displayName: personName, path: sharePath } : {},
		person: personName,
		onMembers(members) {
			others = Math.max(0, members.length - 1)
			showPeople(members)
			showTitle()
		},
		onChange: showTitle,
	})
	const { bytes, seq, state, entries } = await collab.join()
	const etag = collab.checkpointEtag
	if (etag) {
		etags.set(inFolder(fileName), `"${etag}"`)
	}
	// The file names the presentation and its format; a state snapshot, when the session keeps
	// one, is the shared presentation itself (collab:start).
	frame.contentWindow.postMessage({ type: 'deckcraft:open', name: fileName, bytes }, location.origin, [bytes])
	collab.start(seq, entries, state)
	showTitle()
}

start()
