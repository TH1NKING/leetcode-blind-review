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

/** @type {import("esbuild").BuildOptions} */
const sharedBuildOptions = {
  bundle: true,
  charset: "utf8",
  legalComments: "none",
  logLevel: "info",
  minify: false,
  platform: "browser",
  sourcemap: false,
  target: "chrome102",
};

await Promise.all([
  build({
    ...sharedBuildOptions,
    entryPoints: [path.join(projectDirectory, "src/background/index.ts")],
    format: "esm",
    outfile: path.join(extensionDirectory, "background.js"),
  }),
  build({
    ...sharedBuildOptions,
    entryPoints: [path.join(projectDirectory, "src/content/controller.ts")],
    format: "iife",
    outfile: path.join(extensionDirectory, "controller.js"),
  }),
  build({
    ...sharedBuildOptions,
    entryPoints: [path.join(projectDirectory, "src/popup/index.ts")],
    format: "iife",
    outfile: path.join(extensionDirectory, "popup.js"),
  }),
]);

await copyFile(
  path.join(projectDirectory, "extension/manifest.json"),
  path.join(extensionDirectory, "manifest.json"),
);

await Promise.all(
  ["guard.css", "popup.css", "popup.html"].map((file) =>
    copyFile(
      path.join(projectDirectory, "extension", file),
      path.join(extensionDirectory, file),
    ),
  ),
);
