import { chmod } from "node:fs/promises";
import { build } from "esbuild";

await build({
	entryPoints: ["src/index.ts"],
	outfile: "dist/beepbox-export.mjs",
	bundle: true,
	platform: "node",
	format: "esm",
	target: "node20",
	sourcemap: true,
	banner: { js: "#!/usr/bin/env node" },
	logLevel: "info",
});

await chmod("dist/beepbox-export.mjs", 0o755);
