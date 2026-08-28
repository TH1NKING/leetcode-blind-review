import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const RELEASE_DIRECTORY = path.resolve("dist/extension");

describe("release package", () => {
  it("contains only the approved inert MV3 surface", async () => {
    const files = (await readdir(RELEASE_DIRECTORY)).sort();
    const manifest = JSON.parse(
      await readFile(path.join(RELEASE_DIRECTORY, "manifest.json"), "utf8"),
    ) as unknown;
    const background = await readFile(
      path.join(RELEASE_DIRECTORY, "background.js"),
      "utf8",
    );

    expect(files).toEqual(["background.js", "manifest.json"]);
    expect(manifest).toEqual({
      manifest_version: 3,
      name: "LeetCode Blind Review",
      version: "0.1.0",
      description:
        "Start supported LeetCode practice problems without revealing saved code.",
      minimum_chrome_version: "102",
      incognito: "not_allowed",
      permissions: ["storage", "scripting"],
      host_permissions: ["https://leetcode.cn/problems/*"],
      background: {
        service_worker: "background.js",
        type: "module",
      },
      content_security_policy: {
        extension_pages: "script-src 'self'; object-src 'self'",
      },
    });
    expect(background).not.toMatch(
      /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/u,
    );
    expect(background).not.toMatch(
      /(?:__TEST__|testMode|CANARY|innerHTML|textContent|\.value\b|monaco|codemirror)/iu,
    );
  });
});
