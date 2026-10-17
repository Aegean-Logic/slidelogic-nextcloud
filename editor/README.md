# editor/: the SlideLogic web build

This folder holds the SlideLogic web build that the app shows in its iframe
(`/apps/deckcraft/editor/index.html?host=parent&ack=1`). It isn't committed: only this README is.
Until it's here, the editor page says the editor isn't installed instead of opening the file.

The build comes from the SlideLogic repository (`../deckcraft`): `apps/deckcraft-web`, built with
Trunk (`Trunk.toml`: relative URLs, so any app path works). It must include the host bridge for
`?host=parent` (the `deckcraft:` messages: ready/open/save/saved/saveFailed/dirty/failed; see
SlideLogic's `packaging/web/README.md`). Builds without it start on the sample deck, but never ask
for the file.

## Vendoring

From this app's folder:

```sh
scripts/vendor-editor.sh                       # build ../deckcraft/apps/deckcraft-web with trunk, then copy it here
scripts/vendor-editor.sh ../deckcraft/dist/web # copy a site that's already built
scripts/vendor-editor.sh deckcraft-web-X.Y.Z.zip  # unpack a release zip (packaging/web/package.sh)
```

The script keeps this README, replaces everything else, drops the static-host samples
(`_headers`, `.htaccess`, `HOSTING.md`), and checks that `index.html` uses relative URLs and that
the build knows the bridge (`deckcraft:ready`). Set `DECKCRAFT=/path/to/deckcraft` if the
repository isn't next to this one. Building needs `trunk` (`cargo install trunk --locked`) and the
`wasm32-unknown-unknown` target.

After vendoring, bump the app version (`appinfo/info.xml`, `package.json`) so browsers fetch the
new `index.html` (its URL carries `?v=<app version>`), then deploy the app (README, "Install").

The files here are under SlideLogic's licence, MIT OR Apache-2.0.
