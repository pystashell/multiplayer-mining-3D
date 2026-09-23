# v4.0.1 UI acceptance evidence

Reviewed on 2026-09-23 in Chrome 153.0.8010.53 on Windows against local Wrangler at `127.0.0.1:8798`. The 27 JPEGs are full-size conversions of captured PNGs; the 11 JSON files record browser actions, assertions, page exceptions, and failed page responses. All listed browser probes passed. Product code was not modified by the two instrumented probes.

| Required scenario | Evidence |
| --- | --- |
| Desktop lobby, Chinese and English | `routes-results.json`; `desktop-easy-lobby-zh.jpg`, `desktop-easy-lobby-en.jpg`, `compact-medium-lobby-zh.jpg`, `compact-medium-lobby-en.jpg` |
| Story guide consistency | `routes-results.json`, `ultimate-results.json`, `squad-results.json`; easy, medium, hard, Ultimate, and squad dialogue screenshots |
| Desktop dialogue readability | `routes-results.json`, `focus-extended-results.json`; `desktop-easy-dialogue.jpg`, `compact-medium-dialogue.jpg`, `focus-extended-dialogue.jpg` |
| Desktop board and controls | `controls-results.json`, `chord-results.json`, `hint-results.json`; `controls-desktop-board.jpg` |
| Mobile lobby and dialogue | `routes-results.json`; 390×844 and 360×640 Chinese/English lobby and dialogue screenshots |
| Mobile touch controls | `controls-results.json`, `mobile-gestures-results.json`, `hint-results.json`; `controls-mobile-board.jpg`, `mobile-flag-mode-tap.jpg`, `hint-mobile.jpg` |
| Two-client multiplayer | `squad-results.json`; `squad-host.jpg`, `squad-guest.jpg`, `squad-host-story.jpg` |
| Failure, rewind, success, replay, restart | `solo-loss-results.json`, `freeplay-results.json`; `solo-loss-rewind.jpg`, desktop/mobile win and replay screenshots |
| Keyboard focus and dialog semantics | `keyboard-patch-results.json`, `focus-extended-results.json`; `focus-extended-dialogue.jpg` |
| Console and resource checks | The `errors` and `failed` arrays in the browser reports; local Wrangler request log reviewed |

The Ultimate dialog probe exposed the existing game instance in the browser and called its existing `selectTaskMission('ultimate')` method, because the Ultimate entry follows completion of the hard campaign. It verified the actual Ultimate lobby art, dialog art, dimensions, and focus; it did not replay the campaign progression. The Chrome chord probe pressed both mouse buttons on a visible numbered cube and observed one call to the real `chord` method. That board did not have the matching flag count, so successful reveal and wrong-flag branches are covered by `tests/room-engine.test.js` and `tests/interaction-layout.test.js` rather than claimed from that screenshot.

Chrome generated optional `/favicon.ico` requests that Wrangler logged as 404. The site has no favicon asset, this also occurs on the existing version, and it caused no page exception or failed application response in the captured browser flows. The captured page-error and failed-response arrays are empty. No unexpected application asset or WebSocket failure was observed.
