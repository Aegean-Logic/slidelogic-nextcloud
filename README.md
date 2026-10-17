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

Not yet: co-editing (see below), sharing from SlideLogic's own Share button, shared links,
Open in Desktop App, file locking (`files_lock`), Save As into another folder.

### Co-editing

GridLogic and WordLogic edit together live: the Nextcloud app orders everyone's edits, and the
engine in each browser merges them (GridLogic's and WordLogic's `docs/co-editing.md`). SlideLogic's
engine (DeckCraft's) has no shared-edit model yet: its edits are whole-presentation snapshots with
undo, not small operations that can be sent and transformed. Until SlideLogic grows one (stable
slide and shape ids are already there), two people saving the same presentation are kept apart
by the ETag check above: the second save is refused, not merged, and nothing is lost.

## Layout

| Path | What |
|---|---|
| `appinfo/info.xml` | App manifest |
| `lib/` | `Application` (Files hook), `EditorController` (`/edit` page and its CSP), listener |
| `templates/editor.php`, `css/editor.css` | The editor page |
| `src/editor.js` | The host page: WebDAV load/save and the SlideLogic postMessage bridge |
| `src/files.js` | The Files action |
| `js/` | Bundles built from `src/` (`npm run build`) |
| `editor/` | The SlideLogic web build, vendored by `scripts/vendor-editor.sh` (`editor/README.md`) |
| `img/` | App icons: `slidelogic.svg` (48 px and up), `slidelogic-small.svg` and `app.svg` (32 px and below), from the Aegean Office brand set ("Banded slide") |

## Protocol

The page and SlideLogic talk over `postMessage` (`deckcraft:ready`, `open`, `save`, `saved`,
`saveFailed`, `dirty`, `failed`), documented in SlideLogic's `packaging/web/README.md`, "Opening
and saving through the page". Saves of the presentation carry an `id` that the page answers;
copies (`copy: true`) don't.

## Build

```sh
npm install
npm run build
scripts/vendor-editor.sh   # the SlideLogic web build from ../deckcraft into editor/
```

## Install (Docker)

Copy the app without `node_modules/`, `src/` and `.git/`:

```sh
docker exec nextcloud-app-1 mkdir -p /var/www/html/custom_apps/deckcraft
for d in appinfo css editor img js lib templates README.md; do docker cp "$d" nextcloud-app-1:/var/www/html/custom_apps/deckcraft/; done
docker exec nextcloud-app-1 chown -R www-data:www-data /var/www/html/custom_apps/deckcraft
docker exec -u www-data nextcloud-app-1 php occ app:enable deckcraft
```

The web server must serve `.wasm` as `application/wasm` (Nextcloud's `.htaccess` and nginx
sample configs do).

## Licence

AGPL-3.0-or-later (the bundled `@nextcloud/*` libraries are AGPL/GPL). The SlideLogic build in
`editor/` is MIT OR Apache-2.0. The icons in `img/` are the SlideLogic app icon, original work in
the Aegean Logic palette (MIT OR Apache-2.0, as in SlideLogic's `assets/app-icon/`).
