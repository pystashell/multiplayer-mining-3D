# Changelog

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
- Complete local regression suite and Wrangler deployment dry run.
- Cloudflare live-version and live multiplayer smoke checks.

## [3.1.0] - Unreleased

### Added

- Five original procedural science-fiction soundtracks for beginner,
  intermediate, advanced, Ultimate Hacker, and multiplayer play.
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
