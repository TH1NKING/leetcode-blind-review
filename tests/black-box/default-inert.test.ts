import { expect, it } from "vitest";

import { createChromeHarness } from "./chrome-harness.js";

const ROUTES = [
  "https://leetcode.cn/problems/two-sum/description/",
  "https://leetcode.cn/problems/two-sum/solutions/",
  "https://leetcode.cn/contest/weekly-contest-1/",
] as const;

it("installs in Chrome Stable and remains inert while Blind Mode is off", async () => {
  const harness = await createChromeHarness();

  try {
    let chrome = await harness.launch();

    expect(chrome.browserVersion).toMatch(/^Chrome\/\d+/u);
    expect(chrome.extensionMetadata).toEqual({
      name: "LeetCode Blind Review",
      version: "0.1.0",
    });
    await expect
      .poll(() => chrome.readExtensionStorage(), {
        interval: 25,
        timeout: 5_000,
      })
      .toEqual({
        local: {
          persistentConfiguration: {
            schemaVersion: 1,
            blindMode: "off",
            countdownMs: 5_000,
          },
        },
        session: {},
      });

    for (const route of ROUTES) {
      const fixture = await chrome.openFixture(route);
      const snapshot = await fixture.page.evaluate(() => {
        const canary = document.querySelector("#old-code-canary");

        if (!(canary instanceof HTMLElement)) {
          throw new Error("Fixture canary is missing");
        }

        const bounds = canary.getBoundingClientRect();
        const hitTarget = document.elementFromPoint(
          bounds.left + bounds.width / 2,
          bounds.top + bounds.height / 2,
        );
        const fixtureEvents = (
          globalThis as typeof globalThis & { fixtureEvents?: string[] }
        ).fixtureEvents;

        return {
          bodyTags: [...document.body.children].map(({ tagName }) => tagName),
          canaryText: canary.textContent,
          fixtureEvents: fixtureEvents ?? [],
          headTags: [...document.head.children].map(({ tagName }) => tagName),
          hitTargetId: hitTarget?.id,
        };
      });

      expect(snapshot).toEqual({
        bodyTags: ["MAIN", "SCRIPT"],
        canaryText: "OLD_CODE_CANARY",
        fixtureEvents: [],
        headTags: ["META", "TITLE"],
        hitTargetId: "old-code-canary",
      });
      expect(fixture.unexpectedRequests).toEqual([]);
      await fixture.page.close();
    }

    expect(chrome.getServiceWorkerRequests()).toEqual([]);
    await chrome.writeExtensionStorage(
      {
        persistentConfiguration: {
          schemaVersion: 1,
          blindMode: "off",
          countdownMs: 4_000,
        },
      },
      {
        attempt: { id: "ephemeral-attempt" },
        diagnostics: [{ code: "ephemeral-diagnostic" }],
        ownership: { key: "two-sum:typescript" },
      },
    );
    await chrome.close();

    chrome = await harness.launch();
    await expect
      .poll(() => chrome.readExtensionStorage(), {
        interval: 25,
        timeout: 5_000,
      })
      .toEqual({
        local: {
          persistentConfiguration: {
            schemaVersion: 1,
            blindMode: "off",
            countdownMs: 4_000,
          },
        },
        session: {},
      });
    expect(chrome.getServiceWorkerRequests()).toEqual([]);
    await chrome.close();
  } finally {
    await harness.dispose();
  }
});
