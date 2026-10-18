# SlideLogic for Nextcloud

A minimal Nextcloud app (Nextcloud 32–34) that opens presentations from Files in SlideLogic (by
Aegean Logic, based on [DeckCraft](https://github.com/storytold/deckcraft)) and saves them back.
It is the presentation app beside [GridLogic for Nextcloud](../gridcraft-nextcloud) and
[WordLogic for Nextcloud](../wordcraft-nextcloud), and works the same way.

- **Files:** clicking a .pptx, .potx, .ppsx or .deckcraft file opens it in SlideLogic ("Open in
  SlideLogic" in the file's menu).
- **Editor:** `/apps/deckcraft/edit?path=/Documents/Talk.pptx` shows SlideLogic in an iframe on the
  Nextcloud origin (`?host=parent&ack=1`). The page reads the file over WebDAV with the user's
  session and writes back what SlideLogic saves. Slide shows can go full screen. An empty file (a
  new one made in Files) opens as a blank presentation and saves as one.
- **Conflicts:** saves send `If-Match` with the ETag the file had when it was opened (or last
  saved). If someone else changed it meanwhile, Nextcloud answers 412 and SlideLogic tells the user
  instead of overwriting. A file the page didn't open or create is never overwritten
  (`If-None-Match: *`). Nextcloud keeps a version for every save.
- **Formats:** presentations are saved back in their own format (.pptx, .potx, .ppsx, .deckcraft).
- **Copies:** Save As, Export (PDF, pictures, GIF, outline) and Print store their file next to the
  presentation as a new file, `<name> (2).<ext>` and so on when the name is taken; a note over the
  editor says where it went.
- **Comments** are signed with the user's Nextcloud display name.
- **Co-editing:** everyone with the file open edits the same presentation live, as in GridLogic
  and WordLogic. The app orders everyone's edits (`/apps/deckcraft/collab/*`, tables
  `deckcraft_sessions`, `deckcraft_ops`, `deckcraft_members`); SlideLogic in each browser merges
  them (SlideLogic's `docs/co-editing.md`). The member with the lowest client id saves the shared
  presentation to the file every 20 edits or 30 seconds, and on Save. A file changed outside the
  session (another app, a sync client) ends it: reload to pick the change up.
- **State snapshots:** each save for the session (a checkpoint) also stores SlideLogic's snapshot
  of the shared presentation at that point (its own format, base64): a .pptx read back numbers its
  slides afresh, and everyone's edits refer to slides, shapes and masters by id. People who join
  later start from the snapshot. Snapshots are app data
  (`appdata_<instance>/deckcraft/collab/<session>/<log position>.txt`), the latest checkpoint's
  only; a background job removes sessions idle for a day (everything saved) or a month, with their
  snapshots. Pictures travel inside a snapshot, so a checkpoint request can be large: allow request
  bodies of at least 160 MB (PHP `post_max_size` and `upload_max_filesize`, and any proxy limit
  such as nginx `client_max_body_size`; the official Docker image allows far more). A snapshot over
  128 MB isn't kept, and people joining from that save then start from the file: keep very
  picture-heavy presentations to one editor at a time.
- **Presence:** the shapes each person has selected are outlined on the slide in their colour with
  their name, their initials show on the thumbnail of the slide they're on, and a strip above the
  editor lists who's editing. Places travel with each poll and are kept in
  `deckcraft_members.selection`; the server doesn't read them.
- **Undo:** Undo and Redo take back a person's own edits only, never someone else's later change.
- **One build per session:** each copy joins saying what its edits mean (SlideLogic's co-editing
  protocol: the editor's `deckcraft:ready` gives it, the desktop app sends its own). The server keeps
  the newest per session (`deckcraft_sessions.build`, `deckcraft_members.build`) and answers any member
  on an older one with `{rejoin: true}`, so a tab left open across an upgrade reloads with the new
  SlideLogic before it misreads the others' edits or saves its copy over them, and the desktop app
  (File › Open › Nextcloud) edits together with the browser.
- **View-only access:** someone who can read but not write the file follows the others live; an
  edit they try is refused with a message (and the server refuses it too). Only members who can
  edit save the shared presentation, and the server records a checkpoint only from them, and only
  for the save the file actually holds (its ETag).
- **Shared links:** a link to a presentation (`/s/{token}`, link or email share) opens in
  SlideLogic, as a OneDrive link opens in PowerPoint for the web (`lib/Share/EditorPageProvider.php`).
  Nextcloud checks the link first, including a password. An edit link lets people edit together
  with everyone who has the file open, signed-in users included; they show as guests under the
  name they gave Nextcloud. A view-only link follows live but can't change anything (an edit is
  refused with a message, and the server refuses it too). The page reads and writes the file
  through the link's WebDAV address; Save As, Export and Print copies are downloaded instead of
  stored, since a link reaches only the shared presentation. Co-editing goes through
  `/apps/deckcraft/s/{token}/collab/*` (`PublicCollabController`), state snapshots included;
  there, membership is a random key handed out on join, never stored (only its hash).
- **Links to folders:** a folder link's page (Nextcloud's Files, public) gets the "Open in
  SlideLogic" action too, as clicking a presentation's default action. It opens
  `/apps/deckcraft/s/{token}/edit?path=…` (`PublicEditorController`): SlideLogic for that file,
  read and saved through the link's WebDAV address, co-edited like a file link. Paths out of the
  shared folder find nothing.

- **Sharing from SlideLogic:** its Share button opens a Share dialog like PowerPoint's with OneDrive:
  people, groups or email addresses with Can edit or Can view and a message, Copy link with the
  link's permission in plain sight, link settings (password, expiry), and who has access. SlideLogic
  draws the dialog; its requests come to the page (`deckcraft:cloud`), and `src/share.js` carries
  them out with Nextcloud's sharing API (sharee search, shares), answering `deckcraft:cloud:reply`.
  A guest on a link gets Copy link for that link. The desktop app's Share dialog does the same
  through its own Nextcloud sign-in.
- **Open in Desktop App:** in the editor's title bar (`desktop=1` on the editor's URL; not for
  link guests) and "Open in SlideLogic desktop app" in a presentation's Files menu. Both open the
  file in SlideLogic on this computer with a `slidelogic://open?server=…&path=…` link
  (`src/desktop.js`); the desktop app signs in to that Nextcloud first if it needs to, and joins
  the same co-editing session as the browser. The SlideLogic installers register the scheme
  (Windows, Linux).

Not yet: file locking (`files_lock`), Save As into another folder.

## Layout

| Path | What |
|---|---|
| `appinfo/info.xml` | App manifest |
| `lib/` | `Application` (Files hook), `EditorController` (`/edit` page and its CSP), listener |
| `lib/Controller/CollabController.php`, `lib/Service/CollabService.php`, `SnapshotStore.php` | The co-editing sequencer and its snapshots |
| `lib/Migration/`, `lib/BackgroundJob/CleanUpSessions.php` | Its tables, and the hourly clean-up of sessions nobody uses |
| `lib/Share/EditorPageProvider.php`, `lib/Controller/PublicEditorController.php`, `PublicCollabController.php`, `LinkShare.php`, `lib/Listener/LoadPublicFolderScripts.php` | Shared links: the link's page, presentations in a shared folder, co-editing through the link |
| `templates/editor.php`, `css/editor.css` | The editor page |
| `src/editor.js` | The host page: WebDAV load/save and the SlideLogic postMessage bridge |
| `src/collab.js` | Co-editing: joins, sends and polls ops, writes checkpoints, shows who's where |
| `src/share.js` | The Share dialog's operations through Nextcloud's sharing API |
| `src/desktop.js` | Open in Desktop App: the `slidelogic://open` link |
| `src/files.js` | The Files actions |
| `js/` | Bundles built from `src/` (`npm run build`) |
| `editor/` | The SlideLogic web build, vendored by `scripts/vendor-editor.sh` (`editor/README.md`) |
| `img/` | App icons: `slidelogic.svg` (48 px and up), `slidelogic-small.svg` and `app.svg` (32 px and below), from the Aegean Office brand set ("Banded slide") |

## Protocol

The page and SlideLogic talk over `postMessage` (`deckcraft:ready`, `open`, `save`, `saved`,
`saveFailed`, `dirty`, `failed`), documented in SlideLogic's `packaging/web/README.md`, "Opening
and saving through the page". Saves of the presentation carry an `id` that the page answers;
copies (`copy: true`) don't. While co-editing, a Save of the opened file writes a checkpoint
instead.

The Share dialog's requests are `deckcraft:cloud` `{id, op, params}` (to the page; `params` as
JSON text) and `deckcraft:cloud:reply` `{id, ok, json?, error?}` (to SlideLogic). With `desktop=1`,
`deckcraft:openDesktop` (to the page) asks to open the presentation in the desktop app.

### Co-editing

The `deckcraft:collab:*` messages (`start`, `entries`, `op`, `checkpoint`, `checkpointData`,
`selection`, `presence`, `stop`, `error`) are WordLogic's with the `deckcraft:` prefix, documented
in SlideLogic's `packaging/web/README.md`, "Co-editing". A place (`selection`) is `{slide, shapes}`:
the slide's id and the ids of the selected shapes.

The sequencer (`/apps/deckcraft/collab/*`, JSON, with Nextcloud's CSRF token or
`OCS-APIRequest: true`), as WordLogic's:

| Route | Does |
|---|---|
| `POST join {fileId, etag, build}` | `{sessionId, client, seq, hasState, entries, members, canEdit, build}` (`build`: the newest in the session; a copy on an older one leaves), or `{retry: true}` (load the file again) |
| `GET state ?sessionId&client&seq` | The state snapshot for `seq` (when `hasState`); 404 `{retry: true}` if a newer save replaced it |
| `POST push {sessionId, client, clientSeq, base, op}` | `{seq}`; a retried push gets the same position; 403 for view-only members, 400 for an op over 64 MB |
| `GET sync ?sessionId&client&since&sel` | `{entries, members, checkpointSeq, checkpointEtag}`, or `{rejoin: true}`; `{rejoin: true, outdated: true}` to a member on an older build than the session's (any call) |
| `POST checkpoint {sessionId, client, seq, etag, state}` | Records the save (only for the ETag the file has) and keeps its snapshot |
| `POST leave {sessionId, client}` | |

Through a shared link the same routes are `/apps/deckcraft/s/{token}/collab/*`: join also takes
`displayName` (and, in a shared folder, the presentation's `path` there) and returns `key`, which
every later call (the snapshot's included) sends back.

## Build

```sh
npm install
npm run build
scripts/vendor-editor.sh   # the SlideLogic web build from ../deckcraft (or $DECKCRAFT) into editor/
```

## Install (Docker)

Copy the app without `node_modules/`, `src/` and `.git/`:

```sh
docker exec nextcloud-app-1 mkdir -p /var/www/html/custom_apps/deckcraft
for d in appinfo css editor img js lib templates README.md; do docker cp "$d" nextcloud-app-1:/var/www/html/custom_apps/deckcraft/; done
docker exec nextcloud-app-1 chown -R www-data:www-data /var/www/html/custom_apps/deckcraft
docker exec -u www-data nextcloud-app-1 php occ app:enable deckcraft
```

Updating an installed copy: copy the folders again, then
`docker exec -u www-data nextcloud-app-1 php occ upgrade` (it runs the migration that adds the
co-editing tables). On Git Bash, set `MSYS_NO_PATHCONV=1` so container paths aren't rewritten.

The web server must serve `.wasm` as `application/wasm` (Nextcloud's `.htaccess` and nginx
sample configs do).

## Licence

AGPL-3.0-or-later (the bundled `@nextcloud/*` libraries are AGPL/GPL). The SlideLogic build in
`editor/` is MIT OR Apache-2.0. The icons in `img/` are the SlideLogic app icon, original work in
the Aegean Logic palette (MIT OR Apache-2.0, as in SlideLogic's `assets/app-icon/`).
