# Zero Domain Protocol — Soundtrack Composition Prompt

中文版本：[SOUNDTRACK_COMPOSITION_PROMPT.zh-CN.md](SOUNDTRACK_COMPOSITION_PROMPT.zh-CN.md)

This file is the permanent composition brief for the game's procedural
soundtrack. Keep it with the repository so future tracks can be written in the
same musical language instead of being generated as unrelated audio overlays.

## Original request

> 然后添加音乐，你能不能自己做一个音乐？要求 science fiction 的，你根据我们的主题生成，每一关一个新音乐，联机不一样的音乐。

## Canonical prompt for future composers and coding agents

```text
Create an original procedural science-fiction soundtrack for Zero Domain
Protocol, a neon purple/cyan spatial-cartography puzzle game.

The score must feel like one coherent album. Do not imitate an existing game
soundtrack, do not use copyrighted melodies, and do not use external samples or
third-party audio files. Compose the music as data for the existing Web Audio
engine in public/soundtrack.js.

Every track must use the same shared musical grammar:

- a 16-step melody pattern;
- a matching 16-step bass pattern;
- a four-chord loop;
- sparse deterministic data-noise accents;
- the existing pulse, bass, pad, drone, low-pass filter, envelope, stereo-pan
  and dynamics-compressor signal chain;
- step duration calculated as 30 / BPM, with the track's swing applied to
  alternating steps;
- melody notes calculated from rootMidi + 12 + interval;
- bass notes calculated from rootMidi - 12 + interval;
- enough headroom to avoid clipping when the shared music master is raised.

Each track must be recognizable without breaking the album:

1. Beginner / Phantom Port:
   airy first bearing, slow and reassuring, sparse sine pulses.
2. Intermediate / Handshake Maze:
   shifting coordinate beacons, syncopated triangle pulses, more forward
   momentum.
3. Advanced / Final Protocol:
   low, tense core convergence, square/saw colours, tighter rhythm.
4. Hidden stage / Echo Matrix:
   high-density recursive-survey arpeggios, fastest tempo, unstable but still
   musical.
5. Multiplayer / Squad Link:
   cooperative survey call-and-response, alternating left/right voices.
6. Lobby / Survey Signal:
   poised between Beginner and Intermediate; welcoming but mysterious,
   immediately identifiable as the entry point to the same system.

For a new track, return a freezeTrack-compatible JavaScript profile containing:
id, title, bpm, rootMidi, pulseWave, bassWave, padWave, filterHz, swing,
pulseGain, bassGain, padGain, noiseGain, melody, bass, chords and noiseSteps.

Before accepting the result, compare it directly with all existing tracks at
equal perceived loudness. Reject it if matching only the scale while using
different envelopes, effects, synthesis architecture or phrase timing.
```

## Existing album profiles

| Scene | BPM | Root | Pulse | Bass | Pad | Musical role |
| --- | ---: | ---: | --- | --- | --- | --- |
| Beginner | 72 | D3 | sine | triangle | sine | airy first bearing |
| Intermediate | 92 | A2 | triangle | sawtooth | triangle | perspective trace |
| Advanced | 116 | C♯2 | square | sawtooth | triangle | core convergence |
| Hidden stage | 132 | D2 | sawtooth | square | sawtooth | recursive survey |
| Multiplayer | 104 | G2 | triangle | square | sine | stereo squad survey |

The exact existing profiles remain the source of truth in
`public/soundtrack.js`.

## Shared engine rules

All album tracks must remain compatible with the existing engine:

1. The pattern advances in eighth-note steps using `30 / bpm`.
2. Swing alternately lengthens and shortens adjacent steps.
3. Pulse notes use an 18 ms attack followed by exponential decay.
4. Pulse and bass voices pass through the shared resonant low-pass filter.
5. A pad chord starts every 16 steps and decays across most of the phrase.
6. Two continuous drone voices establish the low-frequency world.
7. Short filtered noise events provide the data/glitch texture.
8. Every voice passes through the shared track bus and dynamics compressor.
9. A track must be expressed as procedural profile data, not as a mixed WAV
   pasted over another track.

## Approved Lobby track

The sixth track approved for the Lobby uses this profile:

```js
lobby: freezeTrack({
  id: 'lobby',
  title: 'Zero Domain // Survey Signal',
  bpm: 82,
  rootMidi: 48,
  pulseWave: 'sine',
  bassWave: 'triangle',
  padWave: 'sine',
  filterHz: 2300,
  swing: 0.055,
  pulseGain: 0.05,
  bassGain: 0.046,
  padGain: 0.021,
  noiseGain: 0.011,
  melody: [0, null, 7, 10, null, 12, 7, null, 3, null, 10, 7, 15, null, 12, null],
  bass: [0, null, null, 0, -5, null, null, -5, 3, null, null, 3, -2, null, -5, null],
  chords: [[0, 3, 7], [-5, 0, 5], [3, 7, 10], [-2, 3, 7]],
  noiseSteps: [5, 13],
})
```

This profile was approved by listening on 2026-07-27 and is the production
Lobby score from v3.2 onward.

## Acceptance checklist

- Uses the existing procedural engine rather than a separate synthesizer.
- Sounds related to the five existing tracks at matched playback volume.
- Has its own melody and rhythm without copying an existing profile.
- Does not contain an external sample, third-party song or generated audio
  dependency.
- Does not clip and retains headroom for the independent music-volume control.
- Starts, loops, fades, pauses and resumes safely in desktop and mobile Safari.
- Is approved by listening before it is added to `SCI_FI_TRACKS` (the Lobby
  profile above passed this check on 2026-07-27).
