import { Song, Synth } from "../vendor/beepbox/synth/synth.js";

export interface RenderSettings {
	sampleRate: number;
	loopCount: number;
	enableIntro: boolean;
	enableOutro: boolean;
}

export interface RenderedAudio {
	left: Float32Array;
	right: Float32Array;
	sampleRate: number;
	sampleFrames: number;
	durationSeconds: number;
}

/**
 * Renders one isolated channel, or the full song when soloChannel is null.
 * The render path mirrors editor/SongRenderer.ts, but without browser-specific
 * progress and requestAnimationFrame handling.
 */
export function renderSong(song: Song, settings: RenderSettings, soloChannel: number | null): RenderedAudio {
	const channelCount: number = song.getChannelCount();
	for (let channelIndex: number = 0; channelIndex < channelCount; channelIndex++) {
		song.channels[channelIndex].muted = soloChannel != null && channelIndex != soloChannel;
	}

	const synth: Synth = new Synth(song);
	synth.samplesPerSecond = settings.sampleRate;
	synth.loopRepeatCount = settings.loopCount - 1;
	if (!settings.enableIntro) {
		for (let introIter: number = 0; introIter < song.loopStart; introIter++) {
			synth.goToNextBar();
		}
	}

	const totalBars: number = synth.getTotalBars(settings.enableIntro, settings.enableOutro);
	const totalSampleLength: number = Math.ceil(synth.getSamplesPerBar() * totalBars);
	const left: Float32Array = new Float32Array(totalSampleLength);
	const right: Float32Array = new Float32Array(totalSampleLength);
	const samplesPerRender: number = 65536;

	let sampleIndex: number = 0;
	while (sampleIndex < totalSampleLength) {
		const stopSample: number = Math.min(sampleIndex + samplesPerRender, totalSampleLength);
		const samplesToRender: number = stopSample - sampleIndex;
		synth.synthesize(left.subarray(sampleIndex, stopSample), right.subarray(sampleIndex, stopSample), samplesToRender);
		sampleIndex = stopSample;
	}

	return {
		left,
		right,
		sampleRate: settings.sampleRate,
		sampleFrames: totalSampleLength,
		durationSeconds: totalSampleLength / settings.sampleRate,
	};
}
