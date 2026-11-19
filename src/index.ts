import { resolve } from "node:path";
import { getHelpText, parseCliArgs } from "./args.js";
import { exportProject } from "./export.js";
import { loadSongInput } from "./input.js";
import { VERSION } from "./version.js";

async function main(): Promise<void> {
	const parsed = parseCliArgs(process.argv.slice(2));
	if (parsed.showHelp) {
		process.stdout.write(getHelpText());
		return;
	}
	if (parsed.showVersion) {
		console.log(`beepbox-export ${VERSION}`);
		return;
	}
	const options = parsed.options!;

	const loaded = await loadSongInput(options.input);
	const song = loaded.song;
	const outputDir: string = resolve(options.outputName);

	const result = await exportProject(song, outputDir, loaded.sourceLabel, {
		exportStems: options.exportStems,
		exportMix: options.exportMix,
		channels: options.channels,
		sampleRate: options.sampleRate,
		loopCount: options.loopCount,
		enableIntro: options.intro,
		enableOutro: options.outro,
		force: options.force,
		quiet: options.quiet,
	});

	if (options.quiet) {
		const files: string[] = [...result.stemFiles];
		if (result.mixFile != null) files.push(result.mixFile);
		console.log(files.join("\n"));
	}
}

main().catch((error) => {
	const message: string = error instanceof Error ? error.message : String(error);
	console.error(`Error: ${message}`);
	if (process.env.DEBUG) {
		console.error(error);
	}
	process.exitCode = 1;
});
