import { copyFile, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { build } from "esbuild";

const projectDirectory = fileURLToPath(new URL("..", import.meta.url));
const distributionDirectory = path.resolve(projectDirectory, "dist");
const extensionDirectory = path.join(distributionDirectory, "extension");

if (path.dirname(distributionDirectory) !== path.resolve(projectDirectory)) {
  throw new Error("Refusing to clean a distribution directory outside the project");
}

await rm(distributionDirectory, { recursive: true, force: true });
await mkdir(extensionDirectory, { recursive: true });

await build({
  bundle: true,
  charset: "utf8",
  entryPoints: [path.join(projectDirectory, "src/background/index.ts")],
  format: "esm",
  legalComments: "none",
  logLevel: "info",
  minify: false,
  outfile: path.join(extensionDirectory, "background.js"),
  platform: "browser",
  sourcemap: false,
  target: "chrome102",
});

await copyFile(
  path.join(projectDirectory, "extension/manifest.json"),
  path.join(extensionDirectory, "manifest.json"),
);
