# Changelog

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
