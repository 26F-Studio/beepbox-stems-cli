import { encodeWavStereo16 } from "./wav-encoder.js";
import { RenderedAudio } from "./render.js";

export function encodeRenderedAudioAsWav(audio: RenderedAudio): Uint8Array {
	return new Uint8Array(encodeWavStereo16(audio.left, audio.right, audio.sampleRate));
}
