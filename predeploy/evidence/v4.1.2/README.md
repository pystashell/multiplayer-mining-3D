# v4.1.2 web UI acceptance

Reviewed on 2026-10-01 UTC by Claude, an AI agent, not a person. The page ran
in headless Chrome 154.0.8037.59 on Windows 11, with WebGL 2 through SwiftShader,
against `wrangler dev --local` (real workerd). The sources were branch
`codex/v4.1.2-dependency-upgrades` at `f5b00f6`, which includes every
layout fix described below.

`ui-review.mjs` is the repeatable probe. Point it at a `wrangler dev --local`
server on the release sources:

```
node predeploy/evidence/v4.1.2/ui-review.mjs http://127.0.0.1:8799 lobby story controls multiplayer replay keyboard
```

It drives the real page with mouse, touch, and keyboard input and records
every assertion in `results.json`: 550 checks, all passed, with action
lists, tab orders, and the test room code. It saves the screenshots listed
below. The agent also looked at every screenshot for overlap, clipping,
cropping, and identity problems that the assertions cannot see.

| Required scenario | Evidence and result |
| --- | --- |
| `desktop-lobby-bilingual` | `lobby-desktop-{wide,compact}-{zh,en}.jpg` and `-multiplayer.jpg`. Both sizes, both languages, mission and squad views. Guide name and codename from `public/guide-character.js`, no template markers, no Chinese in English mode, no clipped label, no horizontal overflow, every main action reachable after scrolling, language toggle works. |
| `story-guide-consistency` | `story-art-sheet.jpg` (all 11 configured guide images side by side: same face, hair, outfit and palette; only pose and scene change); `story-*-dialogue.jpg`, `-longest.jpg`, `-reopened.jpg`, `-board.jpg` for Beginner, Intermediate, Advanced and Ultimate; `squad-lobby.jpg`. Every route shows its configured story and dialogue art. No dialogue page contains a term from `config/content-policy.json` or an unresolved template. |
| `desktop-dialogue-readability` | `story-desktop-{wide,compact}-*.jpg`. Every dialogue page at 1440 × 900 and 1280 × 720: dialog, text and Continue in view and uncovered, nothing clipped. One click advances exactly one page; a click on the portrait does not advance; one click outside advances one page. Tab and Shift+Tab stay inside. Focus leaves when the dialogue closes and returns when it reopens after the guided action. |
| `desktop-gameplay-controls` | `controls-desktop-{wide,compact}-{board,hint,settings}.jpg`. Physical first dig, hover highlight equal to the cube under the pointer, right-click flag and unflag, two-button chord, reasoning hint (collapse, expand, exit), right-drag orbit, wheel zoom, movable-centre pan, Reset View back to the default view, keyboard slicing and Show All, settings focus trap and focus return, Return to Lobby. HUD panels stay in view and every visible side-panel control is clickable at its centre. |
| `mobile-lobby-dialogue` | `lobby-mobile-{standard,small}-{zh,en}.jpg` and `-multiplayer.jpg`; `story-mobile-*.jpg`. 390 × 844 and 360 × 640 in both languages: no horizontal overflow, no control off-screen, protocol label clear of the corner buttons. One tap advances exactly one dialogue page. The text is never covered by the portrait. |
| `mobile-gameplay-controls` | `controls-mobile-{standard,small}-*.jpg` (dock, flag, settings, three drawers, hint, landscape, board). Tap dig; flag-mode tap; long-press on a number inspects its neighbours without acting; hold-then-drag pans; two-finger pinch zooms; neither gesture changes the board; the centre button recentres. All five dock buttons are in view, at least 40 px tall and apart. The drawers open and close inside the screen. The hint opens and exits. Landscape and back keeps the game, its state and its save, and the board still takes a tap. |
| `multiplayer-two-client` | `squad-lobby.jpg`, `squad-host.jpg`, `squad-guest.jpg`. Desktop host in Chinese, phone guest in English via the invite link, room `C5XWCH` at 2026-10-01 16:47 UTC. Chat; host dig, guest flag, guest dig, host flag, each shown identically on both clients. Each client describes the same activity in its own language. A guest reload rejoins without a duplicate or ghost member and restores the board. When the host leaves, the guest becomes host. Leaving clears the room from both URLs. |
| `failure-replay-recovery` | `failure-desktop-wide-{loss,rewound,new-task}.jpg`; `replay-{desktop-wide,mobile-standard,mobile-small}-{won,paused,fresh}.jpg`. Loss: a real click on a visible mine opens the failure dialog and loads the new blast sample; rewind restores the board from just before the mine; the next task starts clean. Win: the success replay pauses with board input locked, resumes, exits to the finished board, and Keep Exploring opens one fresh board. On phones the lobby button stays hidden behind the replay HUD. |
| `accessibility-keyboard` | `keyboard-{lobby,dialogue,replay}-focus.jpg`; tab orders in `results.json`. Keyboard only: lobby focus trap, language toggle, settings open/Escape/focus return, mission start, dialogue read-through, in-game Tab to Return to Lobby, free-mode win, replay pause and exit. Every focused lobby control is visible, named and shows a focus ring. Enter on Reinitialize Minefield during the replay changes nothing. Every exposed button in the accessibility tree has a name, and every dialog is modal and labelled. |
| `console-network-clean` | `results.json` audits every page the probes opened (29 pages): no uncaught exceptions, console errors or warnings, failed requests, or third-party runtime requests. No keys or tokens in URLs or logs. The room socket is same-origin, and the public snapshot carries no mine positions before a loss. |

## Fixed during the review

These layout problems were fixed before the final pass. All but one are
older than this release; the exception was introduced and fixed within it.
`tests/browser-layout.test.js` guards all of them, and reverting any one
fix fails its check.

- On phones in English, the lobby's "ZERO DOMAIN // SURVEY TERMINAL" label
  ran under the settings button: 9 px at 390 px wide, 24 px at 360 px.
- The slice bar's per-axis range labels ran into the next axis and under
  Show All at desktop widths from 901 to 1280 px (English) or 1180 px
  (Chinese), including the required 1280 × 720 profile. The bar now uses two
  rows from 1121 to 1365 px and stacks its axes from 901 to 1120 px, and the
  Sector Purge banner sits below the taller bar.
- The two-row bar then reached into the corner of the squad chat panel from
  1121 to 1365 px (the one problem introduced in this release); there the
  chat panel now starts below the bar. From 901 to 1000 px the stacked bar
  ran over the side panels; it now narrows to the gap, and further in
  squads.
- The volume labels broke mid-word ("音效音 / 量") or took three lines
  ("Sound Effects Volume"). Each label now sits on its own line above a
  full-width slider.
- The phone status bar wrapped the flag count ("2 /" over "3") and broke
  the Chinese label inside 剩余. The count stays on one line, labels break
  only at spaces, and "200 / 200" still fits a 360 px screen.
- The bottom hint stack covered the side panels' edges at 1280 px. It now
  stays between them from 1080 px up.

## How the probes set up state

The pages load the browser-test init scripts from `tests/support/game-page.js`:

- a seeded `Math.random`;
- a render-loop pause used only while input is sent, because software
  rendering draws a few frames per second;
- `window.__game`, which exposes the running game.

Board and interface actions use real input, with these exceptions:

- The Ultimate route is selected with `selectTaskMission('ultimate')`, because
  it unlocks only after Advanced.
- For the chord check, the mines around the chosen number are flagged through
  the game's room client first. The chord itself is a real two-button press.
- The losing click targets a mine found in the solo engine's state.
- Nicknames and the chat line are set as input values.

No product file is changed by the probes, and no secret is stored here.

The server places squad mines, so the guest's dig can hit one. When it
does, the probe checks that both clients show the revive prompt, watches
the ad, and waits for both to resume. In the recorded run the guest's dig
missed. The shared revive is also covered by
`tests/browser-multiplayer.test.js`.

## Known issues, not blocking

Both are older than this release, cover no board control, and leave every
control usable.

- About 45 `font:` declarations in `public/style.css` use `var(--font-ui)`,
  which is never defined, so the browser drops them and that text inherits
  16 px Inter: the reasoning panel, add-on cards, settings dialog, replay and
  survey HUDs, and similar. Defining the variable would shrink all of it to
  the declared 7–13 px, which makes the settings dialog hard to read, so it
  is left for a separate typography decision.
- From 901 to 1079 px there is no room for the 360 px minimum hint stack
  between the side panels, so it still covers their inner edges (up to
  about 70 px at 901 px), though far less than the old 720 px stack did.
