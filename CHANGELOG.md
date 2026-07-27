# Changelog

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
