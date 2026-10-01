# Changelog

## [4.1.2] - 2026-10-02

This release also ships the 4.1.1 changes below, which were not released on
their own.

### Security

- Wrangler is upgraded from 4.110.0 to 4.145.0, which clears the four
  high-severity advisories `npm audit` reported in its local-development
  chain (miniflare, sharp, undici). The deployed Worker code is unchanged.

### Fixed

- Resetting the view right after rotating the board lands exactly on the
  default view. The reset used to add the drag's remaining eased motion on
  top of the new view, which could leave the camera far from it.
- The site now has a tab icon (an SVG with a 16/32/48-pixel ICO fallback),
  so browsers no longer log a 404 for `/favicon.ico` on every visit.
- On phones, the lobby's English "ZERO DOMAIN // SURVEY TERMINAL" label no
  longer runs under the settings button in the top-right corner.
- On desktop windows narrower than about 1300 px, the slice bar's range
  labels no longer run into the next axis or under Show All. Between 1121
  and 1365 px the three axes now take their own row below the title, and
  between 901 and 1120 px they stack, with the Sector Purge banner moved
  below the taller bar.
- The volume labels no longer break mid-word ("音效音 / 量") or take three
  lines ("Sound Effects Volume"): each label now sits on its own line above a
  full-width slider.
- On phones the status bar keeps the flag count on one line (it showed
  "2 /" over "3" in English), the Chinese label breaks only at its slash, and
  a three-digit count still fits its cell on 360 px screens.
- From 901 to 1000 px the slice bar narrows to fit between the side panels
  instead of running over them, and in squads it also clears the wider chat
  panel; from 1121 to 1365 px the squad chat panel starts below the taller
  bar.
- On desktops the bottom hint bar and the reasoning panel stay between the
  side panels from 1080 px up (at 1280 px they covered the edge of the left
  panel); narrower windows keep a 360 px minimum.
- These layout problems were found in the v4.1.2 UI review. A browser test
  now checks the lobby label and the phone status bar at both phone sizes,
  and the slice bar, hint bar, and volume labels from 901 to 1920 px, in
  Chinese and English, for solo and squad layouts.

### Changed

- Mine hits play a new short cartoon-style blast
  (`audio/sfx/mine-hit-cartoon-pop.wav`, 0.72 s), chosen by ear from a set
  of candidates. The previous sample held a flat low drone for about a
  quarter of a second after its click, which sounded odd. It still plays
  through the SFX volume and mute controls.
- Three.js is upgraded from 0.150.0 (r150) to 0.186.1 (r186) with the look
  kept as it was. Newer releases changed several rendering defaults, so the
  game now sets them explicitly: colour management off, linear canvas
  output, the r150 light scale (×π) for the scene lights, and the r150
  transmission buffer and alpha for the glass cubes. The frame clock moves
  from the deprecated `THREE.Clock` to `THREE.Timer`.
- Since r171 the Three.js module build is split into `three.module.js` and
  `three.core.js`, and both are now vendored. The first visit downloads
  about 417 KB of gzipped Three.js instead of 239 KB; the files stay
  immutably cached afterwards.
- WebGL 2 is now required: Three.js removed its WebGL 1 fallback in r163.
  Current desktop and mobile browsers all support WebGL 2 (Safari since 15).
- The bundled Inter, Orbitron, and Share Tech Mono fonts move to
  @fontsource 5.3.0. The font files and licenses are byte-identical to the
  5.2 releases; only their versioned asset paths change.

### Verification

- Browser regression tests run the real page in headless Chrome or Edge with
  software WebGL. They check the board build, mouse and touch picking against
  a per-cube raster oracle, hover, slicing, the camera controls, the success
  replay, asset and font loading, and console warnings.
- Render fingerprints of six fixed board scenes, recorded from the r150
  build, confirm the upgraded renderer reproduces the same colours, lighting,
  and glass.
- Worker tests now also run under `wrangler dev --local` (real workerd):
  static asset headers, Durable Object alarms, WebSocket sync and close codes,
  presence, and a two-browser squad revive.
- The coverage report includes code executed in the browser tests. Runtime
  coverage rises from 50% to 82% of executable lines, and `public/app.js`
  from 0% to 65%.
- The page exposes a test hook, defined only by the browser tests, for
  inspecting the running game. Players see no change.

## [4.1.1] - Unreleased

### Security

- The multiplayer server now always uses its own clock for commands. A
  crafted command could previously supply its own timestamp, which let it end
  the 10-second revive countdown early or keep a room from ever expiring.

### Fixed

- Teammates now see a player who joins or reconnects to a squad as online
  immediately, instead of offline until the next action.
- A player whose connection hits an error, is replaced by a newer tab, or
  sends a malformed message is now shown offline consistently. A connection
  the server has closed can no longer act for them or rejoin to replace their
  current connection.

### Changed

- `npm run deploy` now runs the release gate once instead of twice. The gate
  is renamed from `npm run predeploy` to `npm run deploy:gate`: npm runs a
  script named `predeploy` automatically before `deploy`, and `deploy` also
  called it explicitly. `deploy` still calls the gate itself, so
  `--ignore-scripts` cannot skip it.

### Removed

- Unreachable client code left over from an early relay-style multiplayer
  design, including its untranslated system messages (no player-visible
  change).

### Verification

- The automated suite grows from 315 to 428 tests, adding behavioral coverage
  of the Worker routes, the room Durable Object (with runtime-faithful alarm
  delivery and closing-socket handling), both room clients, the dialog focus
  manager, the soundtrack lifecycle, the release tooling, and the deploy gate.
- New `npm run test:coverage` reports deterministic line coverage for the full
  `npm test` pipeline, including files no test loads. CI now runs the suite
  once through it and shows the report on each run's summary page; the build
  result still depends only on the tests.
- A lightweight text check flags browser class methods whose names appear
  nowhere else. It is a heuristic with documented blind spots, not a
  reachability analysis.
- Dependencies are unchanged; Three.js, Wrangler, and the fonts keep their
  locked versions.

## [4.1.0] - Unreleased

### Changed

- The in-game Zero Domain brand and lobby protocol label follow the selected
  Chinese or English language, including the initial Chinese page copy.
- Browser assets and public release metadata use the shared 4.1.0 product version.

### Security

- Added a page Content Security Policy while retaining the web multiplayer
  WebSocket connection.

## [4.0.1] - 2026-09-23

### Fixed

- Free Mode's Continue Exploration action starts a fresh board while preserving
  the selected difficulty, custom dimensions, mine count, and add-on settings.
- Mine hits play the selected 11-tile-hit.wav sample through the existing SFX
  volume and mute controls, replacing the previous synthesized explosion.
- Added regression coverage for repeated Free Mode restarts and sample playback,
  and made release-identity checks follow the declared package version.

This web patch does not include Steam packaging, desktop runtime, multiplayer
transport, artwork, or unrelated interface changes.

## [4.0.0] - 2026-07-28

### Added

- A single guide-character configuration for Chinese and English names,
  codename, role, derived squad labels, and every story-art slot.
- Original zero-domain cartography story copy built around perspective,
  coordinate evidence, route surveying, and anomaly-node clearance.
- Dedicated artwork for the new guide across campaign, dialogue, hidden, and
  multiplayer scenes.
- Automated bilingual parity, guide-template, retired-vocabulary, and artwork
  coverage tests.

### Changed

- Replaced the previous character and franchise-derived story layer with the
  original cartographer and tactical navigator.
- Renamed the former automated protocol internally and publicly to Automated
  Survey, including Worker state, client UI, tests, and soundtrack language.
- Rewrote Chinese and English mission, tutorial, multiplayer, result, music,
  and release copy around the new story.
- Replaced advanced and multiplayer illustrations containing retired system
  terminology with clean zero-domain mapping scenes.

### Removed

- All previous character artwork and runtime references.
- Retired franchise names, locations, organizations, terminology, and
  character-specific structural identifiers.

### Verification

- Complete 299-test local regression suite.
- Retired-vocabulary scan across runtime code, documentation, and filenames.
- Chinese/English browser review and story-art visual audit.
- Wrangler deployment dry run.

## [3.2.0] - 2026-07-27

### Added

- A sixth original procedural score, `Zero Domain // Login Signal`, for the
  Lobby and main screen.
- English and Chinese soundtrack composition briefs preserving the shared
  musical language for future tracks.

### Changed

- Background-music output is doubled from `0.24` to `0.48`; synthesized sound
  effects are unchanged and both volume sliders remain independently
  adjustable.

### Verification

- Soundtrack routing, profile, volume, lifecycle, and UI integration tests.
- Windows-safe live-version verification that exits naturally after success.
- Complete local regression suite and Wrangler deployment dry run.
- Cloudflare live-version and live multiplayer smoke checks.

## [3.1.0] - Unreleased

### Added

- Five original procedural science-fiction soundtracks for beginner,
  intermediate, advanced, Automated Survey, and multiplayer play.
- Independent music and sound-effect switches, volume controls, and local
  preference persistence.
- Optional movable matrix center.
- Desktop right-drag and mobile hold-then-drag matrix panning.
- Desktop and mobile controls for returning the matrix to the center view.
- Executable behavior tests for soundtrack lifecycle and camera gestures.
- Automated version synchronization and public `version.json` metadata.
- GitHub CI for every push and pull request.
- Tag-gated GitHub Release and Cloudflare deployment workflow.

### Changed

- Music output is doubled while the sound-effect output remains unchanged.
- Camera gesture arbitration distinguishes panning, right-click inspection,
  flagging, Chord, and Reduction by visible target and movement threshold.
- Browser cache versions now use the product SemVer.

### Verification

- Complete local regression suite.
- Wrangler deployment dry run.
- Local HTTP module loading check.
- Real two-client WebSocket room smoke test.
