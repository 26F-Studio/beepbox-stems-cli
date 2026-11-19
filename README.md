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

```text
beepbox-stems [options] <songName> <URL|song.json>
```

```bash
beepbox-stems --stems -f wav "My Song" "https://www.beepbox.co/#..."
beepbox-stems --stems -f wav "My Song" "./My Song.json"
```

or without `npm link`:

```bash
node dist/beepbox-stems.mjs --stems -f wav "My Song" "https://www.beepbox.co/#..."
```

URLs contain shell characters such as `#` and `&`, so always quote them.

## Output

```text
My Song/
  ch01.wav
  ch02.wav
  ...
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

## Attribution

The code under `vendor/beepbox/` is from
[johnnesky/beepbox](https://github.com/johnnesky/beepbox), copyright John Nesky
and contributing authors, and is distributed under the MIT license in
`vendor/beepbox/LICENSE.md`.

`src/render.ts` follows the rendering flow of BeepBox's
`editor/SongRenderer.ts`. `src/wav-encoder.ts` was extracted from BeepBox's
`editor/ExportPrompt.ts`.
