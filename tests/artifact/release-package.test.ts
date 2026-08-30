import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const RELEASE_DIRECTORY = path.resolve("dist/extension");

async function readReleaseFile(file: string): Promise<string> {
  return readFile(path.join(RELEASE_DIRECTORY, file), "utf8");
}

describe("release package", () => {
  it("contains only the approved non-destructive Ticket 03 surface", async () => {
    const files = (await readdir(RELEASE_DIRECTORY)).sort();
    const manifest = JSON.parse(await readReleaseFile("manifest.json")) as unknown;
    const [background, controller, popup, popupHtml, guardCss] =
      await Promise.all([
        readReleaseFile("background.js"),
        readReleaseFile("controller.js"),
        readReleaseFile("popup.js"),
        readReleaseFile("popup.html"),
        readReleaseFile("guard.css"),
      ]);
    const scripts = [background, controller, popup].join("\n");

    expect(files).toEqual([
      "background.js",
      "controller.js",
      "guard.css",
      "manifest.json",
      "popup.css",
      "popup.html",
      "popup.js",
    ]);
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
      action: {
        default_popup: "popup.html",
      },
      content_security_policy: {
        extension_pages: "script-src 'self'; object-src 'self'",
      },
    });
    expect(scripts).not.toMatch(
      /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/u,
    );
    expect(scripts).not.toMatch(
      /(?:__TEST__|testMode|CANARY|fixture|monaco|codemirror)/iu,
    );
    expect(controller).not.toMatch(
      /(?:\.click\s*\(|dispatchEvent\s*\(|new\s+(?:MouseEvent|PointerEvent)|localStorage|indexedDB)/u,
    );
    expect(controller.replaceAll("event.value", "")).not.toMatch(
      /(?:innerHTML|outerHTML|textContent|\.value\b|selection|clipboard)/iu,
    );
    expect(popupHtml).not.toMatch(/<script(?!\s+src=)/iu);
    expect(guardCss).not.toMatch(/url\s*\(/iu);
  });
});
