# AGENTS.md

This file is for agents working on `beepbox-export`. It captures the project
boundaries and the BeepBox internals that are otherwise easy to lose.

## Project purpose

`beepbox-export` is a standalone Node.js CLI that:

- accepts a BeepBox project URL, raw song hash, or BeepBox JSON export;
- renders the project with the vendored BeepBox synthesizer;
- writes a full stereo mix by default;
- optionally writes one file per channel;
- supports WAV natively and MP3/OGG through an ffmpeg pipe;
- writes a `manifest.json` describing the export.

It is not a browser application and must not depend on BeepBox's editor, player,
or website code.

## Golden rules

1. Do not edit `vendor/beepbox/synth/`. It is an unmodified upstream snapshot.
2. Keep project-specific code in `src/`.
3. Do not add imports from BeepBox's `editor/`, `player/`, or `website/`; they
   are not vendored.
4. Keep the WAV encoder in `src/wav-encoder.ts`, outside the vendor directory,
   so `scripts/update-synth.sh` cannot overwrite it.
5. Preserve the MIT attribution in `vendor/beepbox/LICENSE.md` and source
   headers.
6. Run `npm test` after behavior changes.
7. Run `npm run typecheck` after TypeScript changes.
8. Use tabs and the repository Prettier config (`npx prettier --write ...`).
9. If a change affects output format or manifest fields, update README and tests.
10. Keep `package.json` and `src/version.ts` versions in sync.

## Commands

```bash
npm install
npm run build       # esbuild bundle -> dist/beepbox-export.mjs
npm run typecheck   # tsc --noEmit
npm test            # builds, then runs Node's built-in test runner
npm start -- --help
npm link            # optional: expose the beepbox-export command
```

The build is ESM, targets Node 20+, bundles all source into one executable file,
adds a `#!/usr/bin/env node` banner, and chmods the output to `0755`.

## Dependency boundary

Only these files import the vendored synthesizer:

```text
src/input.ts   -> vendor/beepbox/synth/synth.js       (Song)
src/render.ts  -> vendor/beepbox/synth/synth.js       (Song, Synth)
src/export.ts  -> vendor/beepbox/synth/synth.js       (Song)
```

`src/wav.ts` -> `src/wav-encoder.ts`. `src/audio-encoder.ts` dispatches to the
WAV encoder or to `src/ffmpeg.ts`. Everything else is CLI/IO logic.

The `synth/` directory is self-contained. Its imports are limited to
`SynthConfig.ts`, `FFT.ts`, `Deque.ts`, and `filtering.ts`. No editor playback
code is needed for rendering.

## Upstream source

- Upstream repository: <https://github.com/johnnesky/beepbox>
- Vendored directory: `vendor/beepbox/synth/`
- Pinned commit: `vendor/beepbox/UPSTREAM_COMMIT`
- License: `vendor/beepbox/LICENSE.md`

Update with:

```bash
scripts/update-synth.sh
scripts/update-synth.sh https://github.com/johnnesky/beepbox.git main
scripts/update-synth.sh /path/to/beepbox-checkout
```

The script replaces the whole vendored `synth/` directory and then runs tests.
`src/wav-encoder.ts` is intentionally outside that directory.

## BeepBox data model cheat sheet

Relevant classes are in `vendor/beepbox/synth/synth.ts`:

- `Song`
  - `scale`, `key`, `tempo`, `beatsPerBar`, `barCount`
  - `patternsPerChannel`, `rhythm`
  - `loopStart`, `loopLength`
  - `pitchChannelCount`, `noiseChannelCount`
  - `channels: Channel[]`
  - `getChannelCount(): number`
  - `getChannelIsNoise(index): boolean`
  - `toBase64String(): string`
  - `toJsonObject(enableIntro, loopCount, enableOutro): Object`

- `Channel`
  - `octave`
  - `instruments: Instrument[]`
  - `patterns: Pattern[]`
  - `bars: number[]`
  - `muted: boolean`

- `Synth`
  - `constructor(song: Song | string | null = null)`
  - `samplesPerSecond: number`
  - `loopRepeatCount: number`
  - `volume: number`
  - `getSamplesPerBar(): number`
  - `getTotalBars(enableIntro, enableOutro): number`
  - `goToNextBar(): void`
  - `synthesize(left: Float32Array, right: Float32Array, length: number, playSong = true): void`

Important: `Channel.muted` is runtime state only. BeepBox does **not** serialize
mute state into the song URL or JSON export. Any per-stem export must set
`channel.muted` programmatically or interact with the editor UI.

## Input handling

`src/input.ts` accepts:

- `https://www.beepbox.co/#<song-data>`
- `https://www.beepbox.co/player/#song=<song-data>`
- `#<song-data>`
- `#song=<song-data>`
- raw song data
- a path to a BeepBox JSON export
- inline JSON

It never downloads a remote URL. It only extracts the URL fragment/hash and
passes the song data to `new Song(...)`. Do not add network fetching without a
clear reason and security review.

`new Song(songData)` accepts both compressed Base64-style song strings and JSON
(because `fromBase64String` detects a leading `{`). Invalid compressed data can
fail silently without initializing the object fully, so `input.ts` validates
that `channels`, `barCount`, `loopStart`, and `loopLength` are usable.

JSON caveat: `Song.toJsonObject(enableIntro, loopCount, enableOutro)` can unroll
the sequence according to the export options. If a JSON export already contains
an unrolled sequence, do not blindly apply loop unrolling again. URL input is
the least ambiguous source.

## Exact rendering recipe

`src/render.ts` mirrors the core of BeepBox's `editor/SongRenderer.ts` without
browser progress updates or `requestAnimationFrame`.

For each render:

```ts
// mute all channels except the target channel; null means full mix
for (let i = 0; i < song.getChannelCount(); i++) {
  song.channels[i].muted = soloChannel != null && i != soloChannel;
}

const synth = new Synth(song);
synth.samplesPerSecond = sampleRate;
synth.loopRepeatCount = loopCount - 1;

// Match BeepBox export behavior when intro is excluded.
if (!enableIntro) {
  for (let i = 0; i < song.loopStart; i++) synth.goToNextBar();
}

const totalBars = synth.getTotalBars(enableIntro, enableOutro);
const totalSamples = Math.ceil(synth.getSamplesPerBar() * totalBars);
const left = new Float32Array(totalSamples);
const right = new Float32Array(totalSamples);

// Render in chunks; chunk size does not need to match the browser's adaptive size.
for (let offset = 0; offset < totalSamples; offset += CHUNK) {
  const end = Math.min(offset + CHUNK, totalSamples);
  synth.synthesize(left.subarray(offset, end), right.subarray(offset, end), end - offset);
}
```

Keep the order of `samplesPerSecond`, `loopRepeatCount`, and intro skipping the
same as above. Renderer output was compared against upstream `SongRenderer` for
a test song and was byte-identical for the tested case.

The CLI exposes one `--loop <spec>` option. The spec consists of optional `i`
(intro) and `o` (outro) flags followed by the loop repetition count, e.g. `io1`,
`i2`, `o2`, or `1`. The default is `io1`; unlike BeepBox's export dialog, there
is no automatic song-dependent intro/outro default at the CLI layer.

## Stems and the limiter

BeepBox's `Synth` applies a global output limiter. Rendering each channel in a
fresh `Synth` produces exactly the same kind of isolated channel that manual
solo-and-export produces, but summing independently rendered stems may not
exactly reconstruct the full mix while the limiter is active.

Do not "fix" this by removing the limiter without explicit discussion; that
would change the sound relative to BeepBox. If a true reconstructable stem set
is needed, the downstream design has to be discussed separately, likely by
splitting before the limiter and applying mastering once.

## Per-instrument stems

The current CLI exports per channel, not per instrument. This is intentional:

- `Channel.muted` is the only built-in solo/mute granularity.
- A channel may contain multiple instruments, layered instruments, or
  pattern-specific instrument assignments.
- Splitting individual instruments requires deeper work in the synth/note
  scheduling path; it is not a small CLI-only change.

## Audio output

`src/wav-encoder.ts` was extracted from BeepBox's original
`editor/ExportPrompt.ts` WAV export path. It writes:

- RIFF/WAVE
- 2 channels
- signed 16-bit little-endian PCM
- no compression
- default sample rate 48000 Hz (same as BeepBox WAV export)

Do not replace it with a third-party encoder without a concrete reason. Keeping
the original conversion logic preserves output parity.

`src/audio-encoder.ts` dispatches by format. WAV is written directly. MP3 and OGG
use `src/ffmpeg.ts`, which pipes interleaved float32 PCM to an `ffmpeg` child
process:

- MP3: `libmp3lame`, default `-q:a 2`
- OGG: `libvorbis`, default `-q:a 6`
- output is written to `<name>.part`, then renamed after ffmpeg exits cleanly
- ffmpeg is detected only when a lossy format is requested
- MP3 sample rates are limited to libmp3lame's supported set

## Output contract

Output directory contents:

```text
<name>/
  mix.<ext>        # default, or mode all
  ch01.<ext>       # mode stems or all
  ch02.<ext>
  ...
  manifest.json
```

`<ext>` is `wav`, `mp3`, or `ogg`.

`ch01.<ext>` maps to `channelIndex: 0`; filenames are 1-based. The manifest
contains:

- tool name/version
- timestamp and source label
- format/sample rate
- render settings and song loop metadata
- per-stem channel index, noise flag, instrument count, filename, frames, duration
- mix filename or null
- a note about the limiter caveat

`--force` deletes only recognized generated files (`chNN.*`, `mix.*`,
`manifest.json`, and `.part` files) before writing; it does not recursively
delete the output directory. Keep this behavior unless deliberately changing
the CLI contract.

`--quiet` prints only the generated filenames, one per line, for scripts.

## Known limitations / future work

- MP3/OGG require an external ffmpeg executable; FLAC is not implemented.
- Whole-song Float32 buffers are held in memory. Lossy encoders receive PCM
  chunks through a pipe, but rendering itself is not streamed.
- Empty/silent channels are currently exported as silent WAVs.
- No per-instrument stems.
- No automatic mixdown from stems; mode `mix`/`all` uses a separate full render.
- No normalization, resampling, dithering, metadata tags, or ZIP packaging.
- JSON loop unrolling needs care; URL input is preferred.
- Upstream synthesizer changes can change output, so always pin and test the
  vendor commit.

## Testing notes

`test/cli.test.mjs` uses Node's built-in test runner and executes the built CLI
as a child process. Tests cover:

- URL input with per-channel stems plus mix;
- WAV header and non-silent PCM checks;
- channel selection, loop settings, and quiet stdout;
- existing-output-directory protection and `--force`;
- MP3/OGG encoding through ffmpeg when available;
- quality and MP3 sample-rate validation;
- help/version output;
- JSON file input.

The fixture `test/fixtures/test-song.json` is a synthetic current-format
BeepBox v9 song generated through the `Song` API, not user data.

When adding features, prefer extending these tests rather than adding ad hoc
manual checks. If you change rendering semantics, compare against upstream
`editor/SongRenderer.ts` using a temporary harness.

## Licensing and provenance

- Vendored synthesizer: upstream BeepBox, MIT, see
  `vendor/beepbox/LICENSE.md`.
- `src/render.ts` follows upstream `editor/SongRenderer.ts`.
- `src/wav-encoder.ts` was extracted from upstream `editor/ExportPrompt.ts`.
- CLI, manifest, input parsing, and tests were written for this project.

Keep upstream copyright headers and attribution when moving or copying code.
