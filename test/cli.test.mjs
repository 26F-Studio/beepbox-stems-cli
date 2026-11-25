import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { access, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const projectDir = dirname(dirname(fileURLToPath(import.meta.url)));
const cliPath = join(projectDir, "dist", "beepbox-export.mjs");
const ffmpegAvailable = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status == 0;

// A minimal current-format BeepBox song with one note on each channel.
const SONG_HASH =
	"9n31s0k0l00e00t1Ua7g00j00r1i0o432T0v0u00f0qw02d04w2h0E0T0v0u00f0qw02d04w2h0E0T0v0u00f0qw02d04w2h0E0T2v0u02f0qw02d04w1E0bYp1pFDT97DZc-QzP-Cvj7DZc-jzPY";

async function runCli(args) {
	return execFileAsync(process.execPath, [cliPath, ...args], {
		cwd: projectDir,
		encoding: "utf8",
	});
}

function wavDataSize(buffer) {
	assert.equal(buffer.toString("ascii", 0, 4), "RIFF");
	assert.equal(buffer.toString("ascii", 8, 12), "WAVE");
	assert.equal(buffer.toString("ascii", 36, 40), "data");
	return buffer.readUInt32LE(40);
}

function wavHasNonZeroPcm(buffer) {
	const dataSize = wavDataSize(buffer);
	for (let index = 44; index + 1 < 44 + dataSize; index += 2) {
		if (buffer.readInt16LE(index) != 0) return true;
	}
	return false;
}

test("exports per-channel WAV stems and a manifest", async () => {
	const tempDir = await mkdtemp(join(tmpdir(), "beepbox-export-test-"));
	const outputDir = join(tempDir, "My Song");
	try {
		await runCli(["-m", "all", "-f", "wav", outputDir, `https://www.beepbox.co/#${SONG_HASH}`]);
		const files = await readdir(outputDir);
		assert.deepEqual(files.sort(), ["ch01.wav", "ch02.wav", "ch03.wav", "ch04.wav", "manifest.json", "mix.wav"]);

		for (const file of ["ch01.wav", "ch02.wav", "ch03.wav", "ch04.wav", "mix.wav"]) {
			const wav = await readFile(join(outputDir, file));
			assert.ok(wav.length > 44);
			assert.ok(wavHasNonZeroPcm(wav), `${file} should contain non-silent audio`);
		}

		const manifest = JSON.parse(await readFile(join(outputDir, "manifest.json"), "utf8"));
		assert.equal(manifest.stems.length, 4);
		assert.equal(manifest.format.sampleRate, 48000);
		assert.equal(manifest.mix, "mix.wav");
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});

test("supports channel selection, loop spec, and quiet mode", async () => {
	const tempDir = await mkdtemp(join(tmpdir(), "beepbox-export-test-"));
	try {
		const { stdout } = await runCli(["-m", "stems", "--quiet", "--channel", "1,3", "--loop", "io2", tempDir, `#${SONG_HASH}`]);
		assert.equal(stdout.trim(), "ch02.wav\nch04.wav");
		const files = await readdir(tempDir);
		assert.deepEqual(files.sort(), ["ch02.wav", "ch04.wav", "manifest.json"]);

		const manifest = JSON.parse(await readFile(join(tempDir, "manifest.json"), "utf8"));
		assert.equal(manifest.render.loopCount, 2);
		assert.equal(manifest.render.enableIntro, true);
		assert.equal(manifest.render.enableOutro, true);
		assert.equal(manifest.render.durationSeconds, 8);
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});

test("rejects an out-of-range channel before creating the output directory", async () => {
	const tempDir = await mkdtemp(join(tmpdir(), "beepbox-export-test-"));
	const outputDir = join(tempDir, "Not Created");
	try {
		await assert.rejects(
			() => runCli(["-m", "stems", "--quiet", "--channel", "99", outputDir, `#${SONG_HASH}`]),
			(error) => /Channel index 99 is out of range/.test(error.stderr),
		);
		await assert.rejects(
			() => access(outputDir),
			(error) => error.code == "ENOENT",
		);
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});

test("refuses to overwrite a non-empty directory without --force", async () => {
	const tempDir = await mkdtemp(join(tmpdir(), "beepbox-export-test-"));
	try {
		await runCli(["-m", "stems", "--quiet", tempDir, `#${SONG_HASH}`]);
		await assert.rejects(
			() => runCli(["-m", "stems", "--quiet", tempDir, `#${SONG_HASH}`]),
			(error) => /Output directory is not empty/.test(error.stderr),
		);
		await runCli(["-m", "stems", "--quiet", "--force", tempDir, `#${SONG_HASH}`]);
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});

test("rejects an invalid --loop spec", async () => {
	const tempDir = await mkdtemp(join(tmpdir(), "beepbox-export-test-"));
	try {
		await assert.rejects(
			() => runCli(["-m", "stems", "--quiet", "--loop", "intro", join(tempDir, "out"), `#${SONG_HASH}`]),
			(error) => /--loop must look like/.test(error.stderr),
		);
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});

test("exports only the mix by default as flat files", async () => {
	const tempDir = await mkdtemp(join(tmpdir(), "beepbox-export-test-"));
	const outputBase = join(tempDir, "Mix Only");
	try {
		const { stdout } = await runCli(["--quiet", outputBase, `#${SONG_HASH}`]);
		assert.equal(stdout.trim(), "Mix Only.wav");
		const files = await readdir(tempDir);
		assert.deepEqual(files.sort(), ["Mix Only.json", "Mix Only.wav"]);
		const manifest = JSON.parse(await readFile(join(tempDir, "Mix Only.json"), "utf8"));
		assert.deepEqual(manifest.stems, []);
		assert.equal(manifest.mix, "Mix Only.wav");
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});

test("refuses to overwrite flat mix files without --force", async () => {
	const tempDir = await mkdtemp(join(tmpdir(), "beepbox-export-test-"));
	const outputBase = join(tempDir, "Flat Mix");
	try {
		await runCli(["--quiet", outputBase, `#${SONG_HASH}`]);
		await assert.rejects(
			() => runCli(["--quiet", outputBase, `#${SONG_HASH}`]),
			(error) => /Output file already exists/.test(error.stderr),
		);
		await runCli(["--quiet", "--force", outputBase, `#${SONG_HASH}`]);
		const files = await readdir(tempDir);
		assert.deepEqual(files.sort(), ["Flat Mix.json", "Flat Mix.wav"]);
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});

test("rejects an invalid --mode", async () => {
	const tempDir = await mkdtemp(join(tmpdir(), "beepbox-export-test-"));
	try {
		await assert.rejects(
			() => runCli(["-m", "everything", "--quiet", join(tempDir, "out"), `#${SONG_HASH}`]),
			(error) => /Unsupported mode/.test(error.stderr),
		);
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});

test("exports MP3 with the requested quality", { skip: !ffmpegAvailable }, async () => {
	const tempDir = await mkdtemp(join(tmpdir(), "beepbox-export-test-"));
	const outputBase = join(tempDir, "MP3");
	try {
		await runCli(["-m", "mix", "-f", "mp3", "-q", "2", "--quiet", outputBase, `#${SONG_HASH}`]);
		const files = await readdir(tempDir);
		assert.deepEqual(files.sort(), ["MP3.json", "MP3.mp3"]);
		const mp3 = await readFile(join(tempDir, "MP3.mp3"));
		assert.equal(mp3.toString("ascii", 0, 3), "ID3");
		const manifest = JSON.parse(await readFile(join(tempDir, "MP3.json"), "utf8"));
		assert.equal(manifest.format.container, "mp3");
		assert.equal(manifest.format.encoding, "libmp3lame");
		assert.equal(manifest.format.quality, 2);
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});

test("exports OGG with the default quality", { skip: !ffmpegAvailable }, async () => {
	const tempDir = await mkdtemp(join(tmpdir(), "beepbox-export-test-"));
	const outputBase = join(tempDir, "OGG");
	try {
		await runCli(["-m", "mix", "-f", "ogg", "--quiet", outputBase, `#${SONG_HASH}`]);
		const files = await readdir(tempDir);
		assert.deepEqual(files.sort(), ["OGG.json", "OGG.ogg"]);
		const ogg = await readFile(join(tempDir, "OGG.ogg"));
		assert.equal(ogg.toString("ascii", 0, 4), "OggS");
		const manifest = JSON.parse(await readFile(join(tempDir, "OGG.json"), "utf8"));
		assert.equal(manifest.format.container, "ogg");
		assert.equal(manifest.format.encoding, "libvorbis");
		assert.equal(manifest.format.quality, 6);
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});

test("rejects invalid quality settings", async () => {
	const tempDir = await mkdtemp(join(tmpdir(), "beepbox-export-test-"));
	try {
		await assert.rejects(
			() => runCli(["-f", "wav", "-q", "1", join(tempDir, "wav"), `#${SONG_HASH}`]),
			(error) => /--quality is only supported/.test(error.stderr),
		);
		await assert.rejects(
			() => runCli(["-f", "mp3", "-q", "10", join(tempDir, "mp3"), `#${SONG_HASH}`]),
			(error) => /--quality must be between 0 and 9/.test(error.stderr),
		);
		await assert.rejects(
			() => runCli(["-f", "ogg", "-q", "11", join(tempDir, "ogg"), `#${SONG_HASH}`]),
			(error) => /--quality must be between 0 and 10/.test(error.stderr),
		);
		await assert.rejects(
			() => runCli(["-f", "mp3", "--sample-rate", "96000", join(tempDir, "rate"), `#${SONG_HASH}`]),
			(error) => /not supported by MP3/.test(error.stderr),
		);
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});

test("prints help and version", async () => {
	const help = await runCli(["--help"]);
	assert.match(help.stdout, /Usage:/);
	assert.match(help.stdout, /--mode/);
	assert.match(help.stdout, /--quality/);
	assert.match(help.stdout, /--format/);
	const version = await runCli(["--version"]);
	assert.match(version.stdout, /^beepbox-export \d+\.\d+\.\d+/);
});

test("accepts a BeepBox JSON export", async () => {
	const tempDir = await mkdtemp(join(tmpdir(), "beepbox-export-test-"));
	try {
		const jsonPath = join(projectDir, "test", "fixtures", "test-song.json");
		await runCli(["-m", "stems", "--quiet", tempDir, jsonPath]);
		const files = await readdir(tempDir);
		assert.deepEqual(files.sort(), ["ch01.wav", "ch02.wav", "ch03.wav", "ch04.wav", "manifest.json"]);
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});
