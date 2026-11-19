# Beepbox-Stems

> Designed by MrZ, Made by Deepseek-flash

A standalone command-line renderer that exports BeepBox projects to per-channel
WAV stems and an optional full mix.

It vendors only BeepBox's `synth/` source under `vendor/beepbox/`, so it does not
include the BeepBox editor, player, website, or build system.

## Requirements

- Node.js 20 or newer
- npm

## Build

```bash
npm install
npm run build
```

The executable is written to `dist/beepbox-stems.mjs`.

To expose it as the `beepbox-stems` command:

```bash
npm link
```

## Usage

```bash
beepbox-stems --stems -f wav "https://www.beepbox.co/#..." "My Song"
```

or without `npm link`:

```bash
node dist/beepbox-stems.mjs --stems -f wav "https://www.beepbox.co/#..." "My Song"
```

JSON exports are also accepted:

```bash
beepbox-stems --stems -f wav "./My Song.json" "My Song"
```

URLs contain shell characters such as `#` and `&`, so always quote them.

## Output

```text
My Song/
  ch01.wav
  ch02.wav
  ch03.wav
  ch04.wav
  manifest.json
```

Add `--mix` to also render `mix.wav`.

## Options

```text
--stems                 Export one WAV per channel (default when --mix is omitted)
--mix                   Also export a full mix as mix.wav
-f, --format <format>   Output format. Currently only "wav" is supported. Default: wav
--sample-rate <hz>      Sample rate. Default: 48000
--loop <spec>           Loop controls: i=intro, o=outro, then repetitions. Default: io1
--channel <list>        Comma-separated channel indexes to export, e.g. 0,2,3
-o, --output <dir>      Output directory (alternative to the positional songName)
--force                 Allow writing into an existing non-empty directory
-q, --quiet             Suppress progress output
-h, --help              Show help
-v, --version           Show the version
```

`--loop` uses optional `i` (include intro) and `o` (include outro) flags followed
by the loop repetition count. The default is `io1`. Examples:

```bash
--loop i2    # intro, two loops
--loop o1    # outro, one loop
--loop 1     # no intro or outro, one loop
```

Note: each stem is rendered independently through BeepBox's output limiter.
Summing the stems may not exactly reconstruct `mix.wav` when the limiter is
active.

## Updating the vendored synthesizer

`vendor/beepbox/synth/` is an unmodified copy of the upstream BeepBox `synth/`
directory. The custom WAV encoder lives in `src/wav-encoder.ts` so updating the
vendor directory does not overwrite it.

Update to the latest upstream `main`:

```bash
scripts/update-synth.sh
```

Update from a specific repository and ref:

```bash
scripts/update-synth.sh https://github.com/johnnesky/beepbox.git main
```

Update from an existing checkout:

```bash
scripts/update-synth.sh /path/to/beepbox
```

The script copies `synth/` and `LICENSE.md`, records the upstream commit in
`vendor/beepbox/UPSTREAM_COMMIT`, and runs the test suite.

## Source layout

```text
src/
  args.ts          CLI argument parsing and help
  input.ts         URL / JSON / raw song-data loading
  render.ts        Node adaptation of BeepBox's SongRenderer flow
  wav-encoder.ts   Shared PCM WAV encoder extracted from BeepBox
  wav.ts           WAV file wrapper
  export.ts        Stem/mix export loop and manifest
  index.ts         CLI entry point
vendor/beepbox/
  synth/           Unmodified upstream BeepBox synthesizer
  LICENSE.md       Upstream MIT license
  UPSTREAM_COMMIT  Commit the synthesizer was copied from
test/
  cli.test.mjs
  fixtures/
```

## Attribution

The code under `vendor/beepbox/` is from
[johnnesky/beepbox](https://github.com/johnnesky/beepbox), copyright John Nesky
and contributing authors, and is distributed under the MIT license in
`vendor/beepbox/LICENSE.md`.

`src/render.ts` follows the rendering flow of BeepBox's
`editor/SongRenderer.ts`. `src/wav-encoder.ts` was extracted from BeepBox's
`editor/ExportPrompt.ts`.
