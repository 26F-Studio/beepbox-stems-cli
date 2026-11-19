import { spawn } from "node:child_process";
import { rename, rm } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { RenderedAudio } from "./render.js";

export type LossyFormat = "mp3" | "ogg";

const PCM_FRAMES_PER_CHUNK: number = 65536;

let ffmpegAvailability: Promise<void> | undefined;

/**
 * Verifies that the `ffmpeg` executable is available on PATH.
 * The result is cached for the lifetime of the process.
 */
export function ensureFfmpeg(): Promise<void> {
	if (ffmpegAvailability == undefined) {
		ffmpegAvailability = new Promise<void>((resolve, reject) => {
			const child = spawn("ffmpeg", ["-hide_banner", "-version"], {
				stdio: ["ignore", "ignore", "ignore"],
			});
			child.once("error", (error) => {
				ffmpegAvailability = undefined;
				reject(new Error("ffmpeg not found. Install ffmpeg or use --format wav.", { cause: error }));
			});
			child.once("close", (code) => {
				if (code == 0) {
					resolve();
				} else {
					ffmpegAvailability = undefined;
					reject(new Error(`ffmpeg is not usable (exit code ${code}).`));
				}
			});
		});
	}
	return ffmpegAvailability;
}

/**
 * Encodes rendered stereo PCM by piping interleaved float32 samples to ffmpeg.
 * Output is written to a temporary file and renamed on success.
 */
export async function encodeWithFfmpeg(audio: RenderedAudio, outputPath: string, format: LossyFormat, quality: number): Promise<void> {
	await ensureFfmpeg();

	const tempPath: string = `${outputPath}.part`;
	const codec: string = format == "mp3" ? "libmp3lame" : "libvorbis";
	const args: string[] = [
		"-y",
		"-hide_banner",
		"-loglevel",
		"error",
		"-f",
		"f32le",
		"-ar",
		String(audio.sampleRate),
		"-ac",
		"2",
		"-i",
		"pipe:0",
		"-c:a",
		codec,
		"-q:a",
		String(quality),
		"-f",
		format,
		tempPath,
	];

	let stderr: string = "";
	const child = spawn("ffmpeg", args, { stdio: ["pipe", "ignore", "pipe"] });
	child.stderr.setEncoding("utf8");
	child.stderr.on("data", (chunk: string) => {
		stderr = (stderr + chunk).slice(-8192);
	});

	const exited = new Promise<void>((resolve, reject) => {
		child.once("error", reject);
		child.once("close", (code, signal) => {
			if (code == 0) {
				resolve();
				return;
			}
			const status: string = signal != null ? `signal ${signal}` : `exit code ${code}`;
			const detail: string = stderr.trim() == "" ? "" : `: ${stderr.trim()}`;
			reject(new Error(`ffmpeg failed (${status})${detail}`));
		});
	});

	try {
		await Promise.all([pipeline(Readable.from(interleavedPcmChunks(audio)), child.stdin), exited]);
		await rename(tempPath, outputPath);
	} catch (error) {
		child.kill();
		await rm(tempPath, { force: true });
		throw error;
	}
}

async function* interleavedPcmChunks(audio: RenderedAudio): AsyncGenerator<Buffer> {
	for (let startFrame: number = 0; startFrame < audio.sampleFrames; startFrame += PCM_FRAMES_PER_CHUNK) {
		const endFrame: number = Math.min(startFrame + PCM_FRAMES_PER_CHUNK, audio.sampleFrames);
		const buffer: Buffer = Buffer.allocUnsafe((endFrame - startFrame) * 8);
		let offset: number = 0;
		for (let frame: number = startFrame; frame < endFrame; frame++) {
			buffer.writeFloatLE(audio.left[frame], offset);
			offset += 4;
			buffer.writeFloatLE(audio.right[frame], offset);
			offset += 4;
		}
		yield buffer;
	}
}
