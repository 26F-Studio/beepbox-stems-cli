// Extracted from BeepBox editor/ExportPrompt.ts.
// Copyright (c) John Nesky and contributing authors, distributed under the MIT license.
// See vendor/beepbox/LICENSE.md.

/**
 * Encodes stereo float samples as a 16-bit PCM RIFF/WAVE file.
 * This is the same format used by BeepBox's browser WAV export.
 */
export function encodeWavStereo16(recordedSamplesL: Float32Array, recordedSamplesR: Float32Array, sampleRate: number): ArrayBuffer {
	if (recordedSamplesL.length != recordedSamplesR.length) {
		throw new Error("Left and right sample arrays must have the same length.");
	}

	const sampleFrames: number = recordedSamplesL.length;
	const wavChannelCount: number = 2;
	const bytesPerSample: number = 2;
	const bitsPerSample: number = 8 * bytesPerSample;
	const sampleCount: number = wavChannelCount * sampleFrames;
	const totalFileSize: number = 44 + sampleCount * bytesPerSample;

	let index: number = 0;
	const arrayBuffer: ArrayBuffer = new ArrayBuffer(totalFileSize);
	const data: DataView = new DataView(arrayBuffer);
	data.setUint32(index, 0x52494646, false);
	index += 4; // "RIFF"
	data.setUint32(index, 36 + sampleCount * bytesPerSample, true);
	index += 4; // size of remaining file
	data.setUint32(index, 0x57415645, false);
	index += 4; // "WAVE"
	data.setUint32(index, 0x666d7420, false);
	index += 4; // "fmt "
	data.setUint32(index, 0x00000010, true);
	index += 4; // size of following header
	data.setUint16(index, 0x0001, true);
	index += 2; // not compressed
	data.setUint16(index, wavChannelCount, true);
	index += 2; // channel count
	data.setUint32(index, sampleRate, true);
	index += 4; // sample rate
	data.setUint32(index, sampleRate * bytesPerSample * wavChannelCount, true);
	index += 4; // bytes per second
	data.setUint16(index, bytesPerSample * wavChannelCount, true);
	index += 2; // block align
	data.setUint16(index, bitsPerSample, true);
	index += 2; // bits per sample
	data.setUint32(index, 0x64617461, false);
	index += 4; // "data"
	data.setUint32(index, sampleCount * bytesPerSample, true);
	index += 4;

	const range: number = (1 << (bitsPerSample - 1)) - 1;
	for (let i: number = 0; i < sampleFrames; i++) {
		const valL: number = Math.floor(Math.max(-1, Math.min(1, recordedSamplesL[i])) * range);
		const valR: number = Math.floor(Math.max(-1, Math.min(1, recordedSamplesR[i])) * range);
		data.setInt16(index, valL, true);
		index += 2;
		data.setInt16(index, valR, true);
		index += 2;
	}

	return arrayBuffer;
}
