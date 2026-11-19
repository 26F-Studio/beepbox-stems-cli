import { readFile, stat } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { Song } from "../vendor/beepbox/synth/synth.js";

export interface LoadedSong {
	song: Song;
	sourceLabel: string;
	suggestedName: string;
}

export async function loadSongInput(input: string): Promise<LoadedSong> {
	const trimmedInput: string = input.trim();
	if (trimmedInput == "") throw new Error("The input URL or JSON path is empty.");

	let data: string | undefined = undefined;
	let sourceLabel: string = describeSource(trimmedInput);
	let suggestedName: string = "beepbox-song";

	const filePath: string = resolve(trimmedInput);
	try {
		const fileStat = await stat(filePath);
		if (fileStat.isFile()) {
			data = await readFile(filePath, "utf8");
			sourceLabel = filePath;
			suggestedName = basename(filePath, extname(filePath)) || "beepbox-song";
		} else if (fileStat.isDirectory()) {
			throw new Error(`Input path is a directory, not a song file: ${filePath}`);
		}
	} catch (error: any) {
		if (error?.code != "ENOENT" && error?.code != "ENAMETOOLONG") throw error;
		if (/\.json$/i.test(trimmedInput)) {
			throw new Error(`Song JSON file not found: ${filePath}`);
		}
	}

	if (data == undefined) data = trimmedInput;

	const songData: string = extractSongData(data);
	if (songData == "") throw new Error("No BeepBox song data was found in the input.");

	let song: Song;
	try {
		song = new Song(songData);
	} catch (error) {
		throw new Error(`Could not parse BeepBox song data: ${error instanceof Error ? error.message : String(error)}`);
	}
	validateSong(song);

	return { song, sourceLabel, suggestedName };
}

function extractSongData(rawInput: string): string {
	let text: string = rawInput.trim();

	if (/^https?:\/\//i.test(text)) {
		let url: URL;
		try {
			url = new URL(text);
		} catch {
			throw new Error(`Invalid URL: ${describeSource(text)}`);
		}
		if (!url.hash) {
			throw new Error('The URL does not contain song data in its fragment. Use BeepBox\'s "Copy Song URL" option.');
		}
		text = url.hash;
	} else if (/^www\./i.test(text)) {
		return extractSongData("https://" + text);
	} else if (/^[^/\\]+\.json(?:[?#].*)?$/i.test(text)) {
		throw new Error(`Song JSON file not found: ${resolve(text)}`);
	}

	if (text.startsWith("#")) text = text.slice(1);
	if (text.startsWith("song=")) text = text.slice("song=".length);
	return text.trim();
}

function validateSong(song: Song): void {
	if (song.channels == undefined || song.channels.length == 0) {
		throw new Error("The input did not contain a valid BeepBox song.");
	}
	if (!Number.isFinite(song.barCount) || song.barCount <= 0) {
		throw new Error("The input song has an invalid bar count.");
	}
	if (!Number.isFinite(song.loopStart) || !Number.isFinite(song.loopLength)) {
		throw new Error("The input song has invalid loop settings.");
	}
}

function describeSource(input: string): string {
	if (input.startsWith("#") || input.startsWith("song=")) {
		return `inline song data (${input.length} characters)`;
	}
	if (input.startsWith("{")) {
		return `inline JSON (${input.length} characters)`;
	}
	if (/^https?:\/\//i.test(input)) {
		try {
			const url: URL = new URL(input);
			return url.origin + url.pathname;
		} catch {
			return "URL";
		}
	}
	return input;
}
