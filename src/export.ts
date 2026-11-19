import { mkdir, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
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
	outputDir: string;
	stemFiles: string[];
	mixFile: string | null;
	durationSeconds: number;
}

export async function exportProject(song: Song, outputDir: string, sourceLabel: string, options: ExportOptions): Promise<ExportResult> {
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

	await prepareOutputDirectory(outputDir, options.force);

	const channelNumberWidth: number = Math.max(2, String(song.getChannelCount()).length);
	const extension: string = getFileExtension(options.format);
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
			await writeRenderedAudio(audio, join(outputDir, fileName), options.format, options.quality);
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
		mixFile = `mix.${extension}`;
		await writeRenderedAudio(audio, join(outputDir, mixFile), options.format, options.quality);
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
	await writeFile(join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");

	if (!options.quiet) {
		const elapsedSeconds: number = (Date.now() - startedAt) / 1000;
		console.log(`Done in ${elapsedSeconds.toFixed(2)}s: ${outputDir}`);
	}

	return { outputDir, stemFiles, mixFile, durationSeconds };
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
