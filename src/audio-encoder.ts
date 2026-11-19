import { writeFile } from "node:fs/promises";
import { encodeWithFfmpeg, LossyFormat } from "./ffmpeg.js";
import type { RenderedAudio } from "./render.js";
import { encodeRenderedAudioAsWav } from "./wav.js";

export type OutputFormat = "wav" | LossyFormat;

export const DEFAULT_QUALITY: Record<LossyFormat, number> = {
	mp3: 2,
	ogg: 6,
};

export function getFileExtension(format: OutputFormat): string {
	return format;
}

export function getEncoderName(format: OutputFormat): string {
	if (format == "wav") return "pcm_s16le";
	return format == "mp3" ? "libmp3lame" : "libvorbis";
}

export function getEffectiveQuality(format: OutputFormat, quality: number | undefined): number | undefined {
	if (format == "wav") return undefined;
	return quality ?? DEFAULT_QUALITY[format];
}

export async function writeRenderedAudio(
	audio: RenderedAudio,
	outputPath: string,
	format: OutputFormat,
	quality: number | undefined,
): Promise<void> {
	if (format == "wav") {
		await writeFile(outputPath, encodeRenderedAudioAsWav(audio));
		return;
	}
	await encodeWithFfmpeg(audio, outputPath, format, getEffectiveQuality(format, quality)!);
}
