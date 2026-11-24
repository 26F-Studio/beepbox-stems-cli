import { parseArgs } from "node:util";

export interface CliOptions {
	input: string;
	outputName: string;
	format: "wav" | "mp3" | "ogg";
	exportStems: boolean;
	exportMix: boolean;
	sampleRate: number;
	quality?: number;
	loopCount: number;
	intro: boolean;
	outro: boolean;
	channels?: number[];
	force: boolean;
	quiet: boolean;
}

export interface ParsedCli {
	options?: CliOptions;
	showHelp: boolean;
	showVersion: boolean;
}

const HELP: string = `beepbox-export - export BeepBox projects to WAV

Usage:
  beepbox-export [options] <songName> <URL|song.json>

Examples:
  beepbox-export -f wav "My Song" "https://www.beepbox.co/#..."
  beepbox-export -f mp3 -q 2 "My Song" "https://www.beepbox.co/#..."
  beepbox-export -f ogg -q 6 "My Song" "./My Song.json"

Options:
  -m, --mode <mode>       Export mode: mix, stems, or all. Default: mix
  -f, --format <format>   Output format: wav, mp3, or ogg. Default: wav
  -q, --quality <level>   Encoder quality: mp3 0-9 (lower=better), ogg 0-10 (higher=better)
  --sample-rate <hz>      Sample rate. Default: 48000
  --loop <spec>           Loop controls: i=intro, o=outro, then repetitions. Default: io1
  --channel <list>        Comma-separated channel indexes to export, e.g. 0,2,3
  --force                 Allow writing into an existing non-empty directory
  --quiet                 Suppress progress output
  -h, --help              Show this help
  -v, --version           Show the version

--loop examples: io1 (intro + outro, one loop), i2 (intro, two loops),
o2 (outro, two loops), 1 (no intro or outro, one loop).

MP3 and OGG output require the ffmpeg executable on PATH. Default qualities are
mp3 2 and ogg 6.

URLs contain shell characters such as # and &. Always wrap them in quotes.
`;

export function getHelpText(): string {
	return HELP;
}

export function parseCliArgs(argv: string[]): ParsedCli {
	let parsed;
	try {
		parsed = parseArgs({
			args: argv,
			allowPositionals: true,
			options: {
				mode: { type: "string", short: "m" },
				format: { type: "string", short: "f" },
				quality: { type: "string", short: "q" },
				"sample-rate": { type: "string" },
				loop: { type: "string" },
				channel: { type: "string", multiple: true },
				force: { type: "boolean" },
				quiet: { type: "boolean" },
				help: { type: "boolean", short: "h" },
				version: { type: "boolean", short: "v" },
			},
		});
	} catch (error) {
		throw new Error(error instanceof Error ? error.message : String(error));
	}

	const values = parsed.values;
	if (values.help) return { showHelp: true, showVersion: false };
	if (values.version) return { showHelp: false, showVersion: true };

	if (parsed.positionals.length != 2) {
		throw new Error("Need 2 params.\nUsage: beepbox-export [options] <songName> <URL|song.json>.");
	}

	const outputName: string = parsed.positionals[0];
	const input: string = parsed.positionals[1];

	const format: string = (values.format ?? "wav").toLowerCase();
	if (format != "wav" && format != "mp3" && format != "ogg") {
		throw new Error(`Unsupported format "${format}". Use "wav", "mp3", or "ogg".`);
	}

	let quality: number | undefined = undefined;
	if (values.quality != undefined) {
		if (format == "wav") {
			throw new Error("--quality is only supported with --format mp3 or ogg.");
		}
		const maxQuality: number = format == "mp3" ? 9 : 10;
		quality = parseInteger(values.quality, "--quality", 0, maxQuality);
	}

	const sampleRate: number = parseInteger(values["sample-rate"] ?? "48000", "--sample-rate", 8000, 192000);
	if (format == "mp3" && !MP3_SAMPLE_RATES.has(sampleRate)) {
		throw new Error(`--sample-rate ${sampleRate} is not supported by MP3. Use one of: ${Array.from(MP3_SAMPLE_RATES).join(", ")}.`);
	}
	const loop = parseLoopSpec(values.loop ?? "io1");

	let channels: number[] | undefined = undefined;
	const channelValues: string[] | undefined = values.channel as string[] | undefined;
	if (channelValues != undefined) {
		const channelSet: Set<number> = new Set<number>();
		for (const channelValue of channelValues) {
			for (const part of channelValue.split(",")) {
				const trimmed: string = part.trim();
				if (trimmed == "") continue;
				channelSet.add(parseInteger(trimmed, "--channel", 0, 100000));
			}
		}
		channels = Array.from(channelSet).sort((a, b) => a - b);
		if (channels.length == 0) throw new Error("--channel did not contain any channel indexes.");
	}

	const mode: string = (values.mode ?? "mix").toLowerCase();
	if (mode != "stems" && mode != "mix" && mode != "all") {
		throw new Error(`Unsupported mode "${mode}". Use "stems", "mix", or "all".`);
	}
	const exportStems: boolean = mode == "stems" || mode == "all";
	const exportMix: boolean = mode == "mix" || mode == "all";

	return {
		showHelp: false,
		showVersion: false,
		options: {
			input,
			outputName,
			format,
			exportStems,
			exportMix,
			sampleRate,
			quality,
			loopCount: loop.loopCount,
			intro: loop.intro,
			outro: loop.outro,
			channels,
			force: values.force == true,
			quiet: values.quiet == true,
		},
	};
}

function parseInteger(value: string, optionName: string, min: number, max: number): number {
	if (!/^\d+$/.test(value.trim())) {
		throw new Error(`${optionName} must be an integer, got "${value}".`);
	}
	const numberValue: number = Number(value);
	if (!Number.isSafeInteger(numberValue) || numberValue < min || numberValue > max) {
		throw new Error(`${optionName} must be between ${min} and ${max}, got "${value}".`);
	}
	return numberValue;
}

interface LoopSpec {
	intro: boolean;
	outro: boolean;
	loopCount: number;
}

function parseLoopSpec(value: string): LoopSpec {
	const match: RegExpExecArray | null = /^([io]*)(\d+)$/i.exec(value.trim());
	if (match == null) {
		throw new Error('--loop must look like "io1": optional i (intro) and o (outro) flags followed by a loop count.');
	}
	const flags: string = match[1].toLowerCase();
	if (new Set(flags).size != flags.length) {
		throw new Error(`--loop contains duplicate flags: "${value}".`);
	}
	return {
		intro: flags.includes("i"),
		outro: flags.includes("o"),
		loopCount: parseInteger(match[2], "--loop", 1, 1000),
	};
}

const MP3_SAMPLE_RATES: ReadonlySet<number> = new Set<number>([8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000]);
