# Beepbox-Export

> Designed by MrZ, Made by Deepseek-flash

A standalone command-line renderer that exports BeepBox projects to a full mix
or per-channel stems in WAV, MP3, or OGG.

It vendors only BeepBox's `synth/` source under `vendor/beepbox/`, so it does not
include the BeepBox editor, player, website, or build system.

## Requirements

- Node.js 20 or newer
- npm
- ffmpeg on `PATH` for MP3/OGG output (WAV does not need it)

## Build

```bash
npm install
npm run build
```

The executable is written to `dist/beepbox-export.mjs`.

To expose it as the `beepbox-export` command:

```bash
npm link
```

## Usage

```text
beepbox-export [options] <songName> <URL|song.json>
```

```bash
beepbox-export "My Song" "https://www.beepbox.co/#..."
beepbox-export -f mp3 -q 0 "My Song" "https://www.beepbox.co/#..."
beepbox-export -m all -f ogg -q 9 "My Song" "./My Song.json"
```

or without `npm link`:

```bash
node dist/beepbox-export.mjs -f wav "My Song" "https://www.beepbox.co/#..."
```

URLs contain shell characters such as `#` and `&`, so always quote them.

## Output

By default, only the full mix is exported. The file extension follows
`--format`:

```text
My Song/
  mix.wav
  manifest.json
```

Use `-m/--mode` to choose the export mode:

- `mix`: only the full mix (default)
- `stems`: one file per channel
- `all`: per-channel stems plus the full mix

For example, `-f mp3 -m all` produces `ch01.mp3`, `ch02.mp3`, ..., and
`mix.mp3`.

## Options

```text
-m, --mode <mode>       Export mode: mix, stems, or all. Default: mix
-f, --format <format>   Output format: wav, mp3, or ogg. Default: wav
-q, --quality <level>   Encoder quality: mp3 0-9 (lower=better), ogg 0-10 (higher=better)
--sample-rate <hz>      Sample rate. Default: 48000
--loop <spec>           Loop controls: i=intro, o=outro, then repetitions. Default: io1
--channel <list>        Comma-separated channel indexes to export, e.g. 0,2,3
--force                 Allow writing into an existing non-empty directory
--quiet                 Suppress progress output
-h, --help              Show help
-v, --version           Show the version
```

MP3 and OGG output are encoded by piping raw PCM to `ffmpeg`. If `ffmpeg` is
missing, those formats fail with a clear error; WAV output remains fully
self-contained. The default qualities are MP3 `2` and OGG `6`.

`--loop` uses optional `i` (include intro) and `o` (include outro) flags followed
by the loop repetition count. The default is `io1`. Examples:

```bash
--loop i2    # intro, two loops
--loop o1    # outro, one loop
--loop 1     # no intro or outro, one loop
```

Note: each stem is rendered independently through BeepBox's output limiter.
Summing the stems may not exactly reconstruct the full mix when the limiter is
active.

## Attribution

The code under `vendor/beepbox/` is from
[johnnesky/beepbox](https://github.com/johnnesky/beepbox), copyright John Nesky
and contributing authors, and is distributed under the MIT license in
`vendor/beepbox/LICENSE.md`.

`src/render.ts` follows the rendering flow of BeepBox's
`editor/SongRenderer.ts`. `src/wav-encoder.ts` was extracted from BeepBox's
`editor/ExportPrompt.ts`.
