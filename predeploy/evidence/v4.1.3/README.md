# v4.1.3 web UI acceptance

Reviewed on 2026-10-02 by Claude, an AI agent, not a person. The page ran in
headless Chrome 154.0.8037.59 on Windows 11, with WebGL 2 through SwiftShader,
against `wrangler dev --local` (real workerd) on branch
`codex/v4.1.3-font-style` at `bb0f464`.

v4.1.3 changes only presentation, and the owner chose each change after
playing side-by-side builds:

- `--font-ui` is defined, but every text size stays as players have seen it.
  The rules take their declared weight, line height and Inter family. The
  guide's action hints stay regular weight.
- The lobby's settings and language buttons are equally tall, level, and a
  fixed 6 px apart.
- On desktop, the dialogue's Skip and Successful Replay buttons sit under
  the portrait with equal margins, level with Continue.

## Text sizes unchanged

`font-size-check.mjs` loads the released v4.1.2 site
(https://3d-multiplayer-mining.pystashell.workers.dev) and the candidate,
starts the same solo board in each, and compares the computed font of every
element matched by a `--font-ui` rule (41 selectors). It covers 1280 × 720
and 390 × 844, in Chinese and English. It ran on Chrome 154.0.8037.93, which
had updated itself after the review.

`font-size-check.json` holds the result. Each of the four cases matches 62
elements, and none changes size. 37 of the 62 change only weight, line
height, or family. The sizes players see are mostly 16 px and 13.3 px on
desktop, with the phone layout's own 6–14 px overrides, exactly as before.

## Full review

`ui-review.mjs` is the v4.1.2 probe with only its version text updated:

```
node predeploy/evidence/v4.1.3/ui-review.mjs http://127.0.0.1:8799 lobby story controls multiplayer replay keyboard
```

It drives the real page with mouse, touch, and keyboard input. It records
every assertion in `results.json` (550 checks, all passed) and saves
the screenshots below. The agent also looked at the screenshots for overlap,
clipping, cropping, and identity problems that the assertions cannot see.

| Required scenario | Evidence and result |
| --- | --- |
| `desktop-lobby-bilingual` | `lobby-desktop-{wide,compact}-{zh,en}.jpg` and `-multiplayer.jpg`. Both sizes and languages: configured guide name and codename, no template markers, no Chinese in English mode, no clipped label, no overflow, protocol label clear of the corner buttons, main actions reachable, language toggle works. |
| `story-guide-consistency` | `story-art-sheet.jpg` and `story-*.jpg` for Beginner, Intermediate, Advanced and Ultimate; `squad-lobby.jpg`. Every route shows its configured art; no retired identity or unresolved template in any dialogue page. |
| `desktop-dialogue-readability` | `story-desktop-{wide,compact}-*.jpg`. Every dialogue page in view and uncovered; one click advances one page; the portrait does not advance it; focus stays inside and returns after the guided action. The Skip button sits under the portrait (`story-desktop-*-easy-dialogue.jpg`). |
| `desktop-gameplay-controls` | `controls-desktop-{wide,compact}-{board,hint,settings}.jpg`. Dig, hover, flag, two-button chord, hint, orbit, zoom, pan, Reset View, keyboard slicing, settings focus, Return to Lobby; every side-panel control clickable. |
| `mobile-lobby-dialogue` | `lobby-mobile-*.jpg`, `story-mobile-*.jpg`. Both phone sizes and languages: no overflow, no off-screen control, protocol label clear of the corner buttons, one tap advances one page. |
| `mobile-gameplay-controls` | `controls-mobile-{standard,small}-*.jpg`. Tap dig, flag mode, long-press inspection, hold-drag pan, pinch, centre button, dock, drawers, hint, landscape and back. |
| `multiplayer-two-client` | `squad-lobby.jpg`, `squad-host.jpg`, `squad-guest.jpg`. Desktop host in Chinese and phone guest in English via the invite link (room `CPKD9F`). Chat; alternating digs and flags shown identically on both clients; activity in each client's language; reload without a ghost member; host transfer; clean exits. |
| `failure-replay-recovery` | `failure-desktop-wide-*.jpg`, `replay-*-{won,paused,fresh}.jpg`. Loss by a real click on a mine, then rewind and a clean new task. A win, then the success replay (paused, input locked), exit, and Keep Exploring. The Successful Replay button sits under the portrait (`replay-desktop-wide-won.jpg`). |
| `accessibility-keyboard` | `keyboard-*-focus.jpg`; tab orders in `results.json`. A keyboard-only path through the lobby, settings, dialogue, game, and replay. Every button has an accessible name, and every dialog is modal and labelled. |
| `console-network-clean` | `results.json` audits every page the probes opened (29 pages): no exceptions, console errors, failed or third-party requests, or secrets in URLs and logs. The room socket is same-origin and never carries the mine layout. |

The probes use the browser-test init scripts from `tests/support/game-page.js`:
a seeded `Math.random`, a render-loop pause used only while input is sent,
and `window.__game`. The few setup steps that bypass the UI are the same as in
v4.1.2: selecting the locked Ultimate route, flagging the chord's mines through
the room client, finding a mine to click, and typing nicknames and chat as input
values. No product file is changed, and no secret is stored here.

The new layout checks are also permanent tests in
`tests/browser-layout.test.js` and `tests/stylesheet-variables.test.js`.
