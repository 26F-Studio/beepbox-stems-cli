import { access, mkdir, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { Song } from "../vendor/beepbox/synth/synth.js";
import { getEffectiveQuality, getEncoderName, getFileExtension, OutputFormat, writeRenderedAudio } from "./audio-encoder.js";
import { renderSong, RenderedAudio, RenderSettings } from "./render.js";
import { VERSION } from "./version.js";

export interface ExportOptions extends RenderSettings {
	format: OutputFormat;
	quality?: number;
	exportStems: boolean;
	exportMix: boolean;
	channels?: number[];
	force: boolean;
	quiet: boolean;
}

export interface ExportResult {
	outputPath: string;
	stemFiles: string[];
	mixFile: string | null;
	durationSeconds: number;
}

export async function exportProject(song: Song, outputName: string, sourceLabel: string, options: ExportOptions): Promise<ExportResult> {
	const allChannels: number[] = [];
	for (let channelIndex: number = 0; channelIndex < song.getChannelCount(); channelIndex++) {
		allChannels.push(channelIndex);
	}
	const channels: number[] = options.channels == undefined ? allChannels : options.channels;
	for (const channelIndex of channels) {
		if (channelIndex < 0 || channelIndex >= song.getChannelCount()) {
			throw new Error(
				`Channel index ${channelIndex} is out of range. This song has ${song.getChannelCount()} channels (0-${song.getChannelCount() - 1}).`,
			);
		}
	}

	// Mix-only exports are flat files (`<name>.<ext>` and `<name>.json`).
	// Any export with stems still needs a directory for the per-channel files.
	const mixOnly: boolean = options.exportMix && !options.exportStems;
	const extension: string = getFileExtension(options.format);
	const outputBaseName: string = basename(outputName);
	const mixFileName: string = mixOnly ? `${outputBaseName}.${extension}` : `mix.${extension}`;
	const manifestFileName: string = mixOnly ? `${outputBaseName}.json` : "manifest.json";
	const getOutputPath = (fileName: string): string => (mixOnly ? join(dirname(outputName), fileName) : join(outputName, fileName));

	if (mixOnly) {
		await prepareFlatOutput(outputName, [mixFileName, manifestFileName], options.force);
	} else {
		await prepareOutputDirectory(outputName, options.force);
	}

	const channelNumberWidth: number = Math.max(2, String(song.getChannelCount()).length);
	const stemEntries: any[] = [];
	const stemFiles: string[] = [];
	let durationSeconds: number = 0;
	const startedAt: number = Date.now();

	if (options.exportStems) {
		for (let exportIndex: number = 0; exportIndex < channels.length; exportIndex++) {
			const channelIndex: number = channels[exportIndex];
			const fileName: string = `ch${String(channelIndex + 1).padStart(channelNumberWidth, "0")}.${extension}`;
			if (!options.quiet) {
				console.log(`[${exportIndex + 1}/${channels.length}] Rendering channel ${channelIndex + 1} (${fileName})...`);
			}

			const audio: RenderedAudio = renderSong(song, options, channelIndex);
			await writeRenderedAudio(audio, getOutputPath(fileName), options.format, options.quality);
			durationSeconds = audio.durationSeconds;
			stemFiles.push(fileName);
			stemEntries.push({
				channelIndex,
				channelNumber: channelIndex + 1,
				isNoise: song.getChannelIsNoise(channelIndex),
				instrumentCount: song.channels[channelIndex].instruments.length,
				file: fileName,
				sampleFrames: audio.sampleFrames,
				durationSeconds: audio.durationSeconds,
			});
		}
	}

	let mixFile: string | null = null;
	if (options.exportMix) {
		if (!options.quiet) console.log("Rendering full mix...");
		const audio: RenderedAudio = renderSong(song, options, null);
		mixFile = mixFileName;
		await writeRenderedAudio(audio, getOutputPath(mixFileName), options.format, options.quality);
		durationSeconds = audio.durationSeconds;
	}

	const manifest: any = {
		tool: {
			name: "beepbox-export",
			version: VERSION,
		},
		generatedAt: new Date().toISOString(),
		source: sourceLabel,
		format: {
			container: options.format,
			encoding: getEncoderName(options.format),
			quality: getEffectiveQuality(options.format, options.quality),
			sampleRate: options.sampleRate,
			channelCount: 2,
		},
		render: {
			loopCount: options.loopCount,
			enableIntro: options.enableIntro,
			enableOutro: options.enableOutro,
			songBarCount: song.barCount,
			songLoopStart: song.loopStart,
			songLoopLength: song.loopLength,
			durationSeconds,
		},
		stems: stemEntries,
		mix: mixFile,
		note: "Each stem is rendered independently through BeepBox's synth and output limiter. Summing the stems may not exactly reconstruct the full mix when the limiter is active.",
	};
	await writeFile(getOutputPath(manifestFileName), JSON.stringify(manifest, null, 2) + "\n", "utf8");

	const outputPath: string = mixOnly ? getOutputPath(mixFileName) : outputName;
	if (!options.quiet) {
		const elapsedSeconds: number = (Date.now() - startedAt) / 1000;
		console.log(`Done in ${elapsedSeconds.toFixed(2)}s: ${outputPath}`);
	}

	return { outputPath, stemFiles, mixFile, durationSeconds };
}

async function prepareFlatOutput(outputBasePath: string, fileNames: string[], force: boolean): Promise<void> {
	if (!force) {
		for (const fileName of fileNames) {
			const filePath: string = join(dirname(outputBasePath), fileName);
			if (await pathExists(filePath)) {
				throw new Error(`Output file already exists: ${filePath}. Use --force to overwrite it.`);
			}
		}
	}
	await mkdir(dirname(outputBasePath), { recursive: true });
}

async function pathExists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch (error: any) {
		if (error?.code == "ENOENT") return false;
		throw error;
	}
}

async function prepareOutputDirectory(outputDir: string, force: boolean): Promise<void> {
	try {
		const outputStat = await stat(outputDir);
		if (!outputStat.isDirectory()) {
			throw new Error(`Output path exists and is not a directory: ${outputDir}`);
		}
		const entries: string[] = await readdir(outputDir);
		if (entries.length > 0 && !force) {
			throw new Error(`Output directory is not empty: ${outputDir}. Use --force to write into it.`);
		}
		if (force) {
			for (const entry of entries) {
				if (
					/^ch\d+\.(wav|mp3|ogg)$/.test(entry) ||
					/^mix\.(wav|mp3|ogg)$/.test(entry) ||
					entry == "manifest.json" ||
					entry.endsWith(".part")
				) {
					await unlink(join(outputDir, entry));
				}
			}
		}
	} catch (error: any) {
		if (error?.code == "ENOENT") {
			await mkdir(outputDir, { recursive: true });
			return;
		}
		throw error;
	}
}
