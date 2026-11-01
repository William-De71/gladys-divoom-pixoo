# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** for the **Divoom Pixoo 64** pixel
display: a Node.js service (Node 22+, ESM, no build step, no dependency but the
SDK) in its own sandboxed Docker container, talking to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js)
and to the displays **on the local network** (`transports: ["local"]`).
`type: "device"`, Gladys 5.3.0+, `categories: ["multimedia"]`. Not affiliated
with Divoom.

The API is the official one (http://doc.divoom-gz.com/web/#/12, "PIXOO64"):
`POST http://<ip>:80/post` with `{ "Command": "...", ... }`, answers
`{ error_code: 0, ... }` or `{}`. Recent firmware may serve it on
`:9000/divoom_api` (seen by the Home Assistant integration
[pixoo-homeassistant](https://github.com/gickowtf/pixoo-homeassistant), MIT:
observations only, no code copied). The search can ask the official Divoom
"Find device" service (`POST https://app.divoom-gz.com/Device/ReturnSameLANDevice`),
the only Internet request, which the user can turn off. **Never tested on a
real Pixoo**: the commands follow the official documentation, checked on
2026-10-31.

## Commands

```bash
npm install
npm test                                  # node --test, fake displays, never the network
node --test test/app.test.js              # one file
UPDATE_BASELINE=1 npm test                # rewrite test/fixtures/*.baseline.json (on purpose only)
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npx github:GladysAssistant/integration-store . --skip-image-check   # store checks
scripts/build-cover.sh                    # cover.jpg from docs/assets/cover.svg
docs/illustrations/render.sh              # docs/assets/widgets.<lang>.png
node .github/scripts/release.mjs next     # the version the next release would get
```

## Architecture

```
index.js                 SDK wiring only (new GladysIntegration + createApp)
src/app.js               every handler: search, poll, commands, messages, scene actions
                         and triggers, widget, test button, status
src/devices.js           entry -> Gladys device (features), values
src/config.js            config_schema -> { cloudDiscovery, hosts, pollMs, language }
src/scenes.js            scene action and trigger keys
src/states.js            state publication: created devices only, coalesced, 240/min, 429 pause
src/widgets.js           the `pixoo` widget (pure, reused by docs/illustrations)
src/i18n.js              runtime texts in en / fr / de / es
src/storage.js           JSON files in /data (pixoos.json: id -> address, MAC, Divoom id, name)
src/pixoo/client.js      local HTTP client: one request at a time per display, :80 then :9000
src/pixoo/discovery.js   Divoom "Find device" service, typed addresses, identities
src/pixoo/frame.js       plain 64 x 64 frames, colors, line positions
test/helpers/fake-pixoo.js      fake displays and Divoom service behind a fake fetch
.github/scripts/release.mjs     version, changelog, bump (tested in test/)
```

## Rules

- **External ids are forever**: `ext:{selector}:device:{id}` where `id` is the
  MAC (12 lowercase hex), else `divoom-<Divoom id>`, else `ip-a-b-c-d` (a
  typed address the Divoom service does not know), and `…:<feature key>`
  (`screen`, `brightness`, `channel`, `message`). A display known by address
  and created keeps that identity when its MAC shows up. Config, action,
  field, option, widget, setting, trigger and variable keys too:
  `test/structure.test.js` compares them to `test/fixtures/manifest.baseline.json`.
- **Feature fields** compared by the Discover "Update" (category, type, unit,
  min, max, step, features added or removed) are pinned in
  `test/fixtures/discovery.baseline.json`; changing them forces users to
  delete and recreate their devices. `min`, `max`, `read_only` and
  `has_feedback` on EVERY feature. `should_poll: false`: the integration asks
  the displays on its own timer.
- **The Pixoo is fragile**: never two requests at once to one display (the
  client queues them); frame ids of `Draw/SendHttpGif` restart at 1 past 32.
  Text (`Draw/SendHttpText`) only shows over a frame sent through the API:
  always a frame first.
- **Only what answers the local API is listed**: the Divoom service also lists
  Bluetooth speakers (Ditoo, Tivoo…) that have no local API.
- **Messages with a duration** put back the view of before the FIRST message
  of a series (channel, clock face). Any other command cancels the pending
  restore.
- **Scene events** once per transition: `unreachable` after two failed
  requests in a row on a display that answered, `reachable_again` at the
  first answer after. Never in reaction to a scene action.
- **States**: only for the devices the user created, through `src/states.js`.
  Republish everything known in `onDeviceCreated`.
- **The container rootfs is read-only**: the only writable folder is /data.
- **Widget content**: after any change, run `docs/illustrations/render.sh` and
  look at the four images.
- **User-facing text** exists in en, fr, de and es: manifest, `src/i18n.js`,
  `docs/*.md`, `README*.md`; `test/i18n.test.js` checks it. German says "du",
  Spanish "usted". Use the words of the Gladys UI (Discover / Découverte /
  Entdecken / Descubrir).
- **No Divoom logo** in the cover or the docs; keep the "not affiliated" notices.
- **Versions belong to the Release workflow**: never edit `version` in
  `package.json`, the lockfile or the manifest, nor the `docker_image` tag.
  Below 1.0.0 until the maintainer runs Release with `release-as: 1.0.0`.
- **Changelog**: Ne jamais éditer CHANGELOG.md à la main, il est généré à la
  release. Écris le titre de PR comme la ligne que l'utilisateur lira.
- **Commits and PR titles** follow Conventional Commits, in English.
- **Forum drafts** (`.github/forum-*.md`) are never committed.
- **Style**: Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network.

## Pitfalls

- The container is behind the Docker bridge: the Pixoo announces nothing on
  the LAN anyway (no mDNS, no SSDP); unicast HTTP to it crosses the bridge.
- Some commands answer `{}` without `error_code`: that is a success.
- Gladys does not send the user's language with a scan or a command: feature
  names and scene errors use the `language` setting.
- The CI smoke test builds a device and counts its features (4): update it
  when a feature is added.
- The validator of the Gladys core creates `gladys-development.duckdb` in the
  current folder: run it from elsewhere.
