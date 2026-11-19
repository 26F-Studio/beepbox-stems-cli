import { parseArgs } from "node:util";

export interface CliOptions {
	input: string;
	outputName?: string;
	format: "wav";
	exportStems: boolean;
	exportMix: boolean;
	sampleRate: number;
	loopCount: number;
	intro?: boolean;
	outro?: boolean;
	channels?: number[];
	force: boolean;
	quiet: boolean;
}

export interface ParsedCli {
	options?: CliOptions;
	showHelp: boolean;
	showVersion: boolean;
}

const HELP: string = `beepbox-stems - export BeepBox projects to WAV stems

Usage:
  beepbox-stems [options] <URL|song.json> [songName]

Examples:
  beepbox-stems --stems -f wav "https://www.beepbox.co/#..." "My Song"
  beepbox-stems --stems -f wav "./My Song.json" "My Song"
  beepbox-stems --mix -f wav "https://www.beepbox.co/#..." "My Song"

Options:
  --stems                 Export one WAV per channel (default when --mix is omitted)
  --mix                   Also export a full mix as mix.wav
  -f, --format <format>   Output format. Currently only "wav" is supported. Default: wav
  --sample-rate <hz>      Sample rate. Default: 48000
  --loop-count <count>    Number of loop repetitions. Default: 1
  --intro                 Include bars before the loop
  --no-intro              Exclude bars before the loop
  --outro                 Include bars after the loop
  --no-outro              Exclude bars after the loop
  --channel <list>        Comma-separated channel indexes to export, e.g. 0,2,3
  -o, --output <dir>      Output directory (alternative to the positional songName)
  --force                 Allow writing into an existing non-empty directory
  -q, --quiet             Suppress progress output
  -h, --help              Show this help
  -v, --version           Show the version

If neither --intro/--no-intro nor --outro/--no-outro is given, the CLI mirrors
BeepBox's export defaults: include intro when loopStart > 0, and include outro
when the loop does not end at the last song bar.

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
				stems: { type: "boolean" },
				mix: { type: "boolean" },
				format: { type: "string", short: "f" },
				"sample-rate": { type: "string" },
				"loop-count": { type: "string" },
				intro: { type: "boolean" },
				"no-intro": { type: "boolean" },
				outro: { type: "boolean" },
				"no-outro": { type: "boolean" },
				channel: { type: "string", multiple: true },
				output: { type: "string", short: "o" },
				force: { type: "boolean" },
				quiet: { type: "boolean", short: "q" },
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

	if (parsed.positionals.length < 1) {
		throw new Error("Missing input URL or JSON path. Use --help for usage.");
	}
	if (parsed.positionals.length > 2) {
		throw new Error("Too many positional arguments. Use --help for usage.");
	}

	const input: string = parsed.positionals[0];
	const positionalOutput: string | undefined = parsed.positionals[1];
	const optionOutput: string | undefined = values.output;
	if (positionalOutput != undefined && optionOutput != undefined) {
		throw new Error("Provide the output name either as the second positional argument or with --output, not both.");
	}

	const format: string = (values.format ?? "wav").toLowerCase();
	if (format != "wav") {
		throw new Error(`Unsupported format "${format}". Only "wav" is currently supported.`);
	}

	const sampleRate: number = parseInteger(values["sample-rate"] ?? "48000", "--sample-rate", 8000, 192000);
	const loopCount: number = parseInteger(values["loop-count"] ?? "1", "--loop-count", 1, 1000);

	if (values.intro && values["no-intro"]) {
		throw new Error("Use only one of --intro and --no-intro.");
	}
	if (values.outro && values["no-outro"]) {
		throw new Error("Use only one of --outro and --no-outro.");
	}
	const intro: boolean | undefined = values.intro ? true : values["no-intro"] ? false : undefined;
	const outro: boolean | undefined = values.outro ? true : values["no-outro"] ? false : undefined;

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

	const exportStems: boolean = values.stems == true || values.mix != true;
	const exportMix: boolean = values.mix == true;

	return {
		showHelp: false,
		showVersion: false,
		options: {
			input,
			outputName: positionalOutput ?? optionOutput,
			format: "wav",
			exportStems,
			exportMix,
			sampleRate,
			loopCount,
			intro,
			outro,
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
