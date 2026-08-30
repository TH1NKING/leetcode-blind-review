import { expect, it } from "vitest";
import type { Page } from "puppeteer-core";

import {
  createChromeHarness,
  type RunningChrome,
} from "./chrome-harness.js";

async function enableBlindMode(
  chrome: RunningChrome,
  foregroundPage?: Page,
): Promise<void> {
  const popup = await chrome.openPopup();
  const enableButton = await popup.waitForSelector(
    'button[aria-label="启用 Blind Mode"]:not([disabled])',
  );

  if (!enableButton) {
    throw new Error("Blind Mode enable control is missing");
  }

  if (foregroundPage) {
    await foregroundPage.bringToFront();
    await enableButton.evaluate((button) => button.click());
  } else {
    await enableButton.click();
  }
  await expect
    .poll(() => chrome.readExtensionStorage(), { interval: 25, timeout: 5_000 })
    .toMatchObject({
      local: { persistentConfiguration: { blindMode: "on" } },
    });
  await popup.close();
}

async function disableBlindMode(chrome: RunningChrome): Promise<void> {
  const popup = await chrome.openPopup();
  const disableButton = await popup.waitForSelector(
    'button[aria-label="关闭 Blind Mode"]:not([disabled])',
  );

  if (!disableButton) {
    throw new Error("Blind Mode disable control is missing");
  }

  await disableButton.click();
  await expect
    .poll(() => chrome.readExtensionStorage(), { interval: 25, timeout: 5_000 })
    .toMatchObject({
      local: { persistentConfiguration: { blindMode: "off" } },
      session: {},
    });
  await popup.close();
}

it("publishes Blind Mode on only after the guarded runtime is registered", async () => {
  const harness = await createChromeHarness();

  try {
    const chrome = await harness.launch();
    expect(await chrome.readRegisteredContentScripts()).toEqual([]);
    await enableBlindMode(chrome);
    expect(await chrome.readRegisteredContentScripts()).toEqual([
      {
        allFrames: false,
        css: ["guard.css"],
        id: "blind-attempt-runtime-v1",
        js: ["controller.js"],
        matchOriginAsFallback: false,
        matches: ["https://leetcode.cn/problems/*/description/*"],
        persistAcrossSessions: true,
        runAt: "document_start",
        world: "ISOLATED",
      },
    ]);

    await chrome.close();
  } finally {
    await harness.dispose();
  }
});

it("rolls a rejected guarded-runtime registration completely back to off", async () => {
  const harness = await createChromeHarness({
    omitExtensionFiles: ["controller.js"],
  });

  try {
    const chrome = await harness.launch();
    const popup = await chrome.openPopup();
    const enableButton = await popup.waitForSelector(
      'button[aria-label="启用 Blind Mode"]:not([disabled])',
    );

    if (!enableButton) {
      throw new Error("Blind Mode enable control is missing");
    }

    await enableButton.click();
    await expect
      .poll(
        () =>
          popup.$eval(
            'button[aria-label="启用 Blind Mode"]',
            (button) => (button as HTMLButtonElement).disabled,
          ),
        { interval: 25, timeout: 5_000 },
      )
      .toBe(false);
    await expect
      .poll(() => chrome.readExtensionStorage(), { interval: 25, timeout: 5_000 })
      .toMatchObject({
        local: { persistentConfiguration: { blindMode: "off" } },
        session: {},
      });
    expect(await chrome.readRegisteredContentScripts()).toEqual([]);
    const fixture = await chrome.openFixture(
      "https://leetcode.cn/problems/two-sum/description/",
    );
    expect(
      await fixture.page.evaluate(
        () => !document.querySelector('[aria-label="Blind Attempt"]'),
      ),
    ).toBe(true);

    await fixture.page.close();
    await popup.close();
    await chrome.close();
  } finally {
    await harness.dispose();
  }
});

it("reconciles an interrupted enabling transaction to a clean off state", async () => {
  const harness = await createChromeHarness();

  try {
    let chrome = await harness.launch();
    await chrome.writeExtensionStorage(
      {
        persistentConfiguration: {
          schemaVersion: 1,
          blindMode: "enabling",
          countdownMs: 5_000,
        },
      },
      { attempt: { generation: 99 } },
    );
    await chrome.close();

    chrome = await harness.launch();
    await expect
      .poll(() => chrome.readExtensionStorage(), { interval: 25, timeout: 5_000 })
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
    expect(await chrome.readRegisteredContentScripts()).toEqual([]);

    await chrome.close();
  } finally {
    await harness.dispose();
  }
});

it("replaces an incompatible persisted runtime before treating Blind Mode as on", async () => {
  const harness = await createChromeHarness();

  try {
    const chrome = await harness.launch();
    await chrome.replaceRegisteredContentScript({
      allFrames: false,
      css: ["guard.css"],
      excludeMatches: ["https://leetcode.cn/problems/*/description/*"],
      id: "blind-attempt-runtime-v1",
      js: ["controller.js"],
      matchOriginAsFallback: false,
      matches: ["https://leetcode.cn/problems/*/description/*"],
      persistAcrossSessions: true,
      runAt: "document_start",
      world: "ISOLATED",
    });
    await enableBlindMode(chrome);
    expect(await chrome.readRegisteredContentScripts()).toEqual([
        {
          allFrames: false,
          css: ["guard.css"],
          id: "blind-attempt-runtime-v1",
          js: ["controller.js"],
          matchOriginAsFallback: false,
          matches: ["https://leetcode.cn/problems/*/description/*"],
          persistAcrossSessions: true,
          runAt: "document_start",
          world: "ISOLATED",
        },
      ]);

    await chrome.close();
  } finally {
    await harness.dispose();
  }
});

it("guards the current active Practice View before publishing Blind Mode on", async () => {
  const harness = await createChromeHarness();

  try {
    const chrome = await harness.launch();
    const fixture = await chrome.openFixture(
      "https://leetcode.cn/problems/two-sum/description/",
    );
    await enableBlindMode(chrome, fixture.page);
    await expect
      .poll(
        () =>
          fixture.page.evaluate(
            () =>
              document.querySelector('[aria-label="Blind Attempt"]')?.getAttribute(
                "data-phase",
              ),
          ),
        { interval: 25, timeout: 5_000 },
      )
      .toBe("countdown");
    expect(
      await fixture.page.evaluate(
        () =>
          (
            globalThis as typeof globalThis & { fixtureEvents?: string[] }
          ).fixtureEvents ?? [],
      ),
    ).toEqual([]);

    await fixture.page.close();
    await chrome.close();
  } finally {
    await harness.dispose();
  }
});

it("does not start a Blind Attempt in a background Practice View", async () => {
  const harness = await createChromeHarness();

  try {
    const chrome = await harness.launch();
    await enableBlindMode(chrome);
    const fixture = await chrome.openFixture(
      "https://leetcode.cn/problems/two-sum/description/",
      { openInBackground: true },
    );
    await expect
      .poll(
        () =>
          fixture.page.evaluate(() =>
            document.documentElement.getAttribute(
              "data-lbr-foreground-eligible",
            ),
          ),
        { interval: 25, timeout: 2_000 },
      )
      .toBe("false");
    const snapshot = await fixture.page.evaluate(() => ({
        fixtureEvents:
          (
            globalThis as typeof globalThis & { fixtureEvents?: string[] }
          ).fixtureEvents ?? [],
        guardPhase: document
          .querySelector('[aria-label="Blind Attempt"]')
          ?.getAttribute("data-phase"),
        rootController: document.documentElement.getAttribute(
          "data-lbr-controller-v1",
        ),
        foregroundEligible: document.documentElement.getAttribute(
          "data-lbr-foreground-eligible",
        ),
      }));
    expect(snapshot).toEqual({
      fixtureEvents: [],
      foregroundEligible: "false",
      guardPhase: "guarded-preflight",
      rootController: "active",
    });

    await fixture.page.close();
    await chrome.close();
  } finally {
    await harness.dispose();
  }
});

it("guards the complete Coding Workspace while leaving the description usable", async () => {
  const harness = await createChromeHarness();

  try {
    const chrome = await harness.launch();
    await enableBlindMode(chrome);
    const fixture = await chrome.openFixture(
      "https://leetcode.cn/problems/two-sum/description/",
    );
    await expect
      .poll(
        () =>
          fixture.page.evaluate(
            () =>
              document.querySelector('[aria-label="Blind Attempt"]')?.getAttribute(
                "data-phase",
              ),
          ),
        { interval: 25, timeout: 5_000 },
      )
      .toBe("countdown");

    const snapshot = await fixture.page.evaluate(() => {
      const targetIds = [
        "language-selector",
        "old-code-canary",
        "testcase-canary",
        "result-canary",
        "console-canary",
        "run-control",
        "submit-control",
      ];
      const hitGuard = (id: string) => {
        const target = document.querySelector(`#${id}`);

        if (!(target instanceof HTMLElement)) {
          throw new Error(`Missing fixture target: ${id}`);
        }

        const bounds = target.getBoundingClientRect();
        return Boolean(
          document
            .elementFromPoint(
              bounds.left + bounds.width / 2,
              bounds.top + bounds.height / 2,
            )
            ?.closest('[aria-label="Blind Attempt"]'),
        );
      };
      const description = document.querySelector("#problem-description");
      const workspace = document.querySelector('[aria-label="Coding workspace"]');
      const fixtureEvents = (
        globalThis as typeof globalThis & { fixtureEvents?: string[] }
      ).fixtureEvents;

      if (!(description instanceof HTMLElement) || !(workspace instanceof HTMLElement)) {
        throw new Error("Fixture regions are missing");
      }

      const descriptionBounds = description.getBoundingClientRect();
      const descriptionHit = document.elementFromPoint(
        descriptionBounds.left + descriptionBounds.width / 2,
        Math.max(descriptionBounds.top, 0) + 20,
      );
      return {
        descriptionRemainsUsable: description.contains(descriptionHit),
        fixtureEvents: fixtureEvents ?? [],
        guardedTargets: Object.fromEntries(
          targetIds.map((id) => [id, hitGuard(id)]),
        ),
        workspaceAriaHidden: workspace.getAttribute("aria-hidden"),
        workspaceInert: workspace.inert,
      };
    });

    expect(snapshot).toEqual({
      descriptionRemainsUsable: true,
      fixtureEvents: [],
      guardedTargets: {
        "console-canary": true,
        "language-selector": true,
        "old-code-canary": true,
        "result-canary": true,
        "run-control": true,
        "submit-control": true,
        "testcase-canary": true,
      },
      workspaceAriaHidden: "true",
      workspaceInert: true,
    });
    expect(fixture.unexpectedRequests).toEqual([]);
    expect(chrome.getServiceWorkerRequests()).toEqual([]);
    expect(JSON.stringify(await chrome.readExtensionStorage())).not.toMatch(
      /(?:OLD_CODE|TESTCASE|RESULT|CONSOLE|REMOUNTED_CODE)_CANARY/u,
    );

    await fixture.page.close();
    await chrome.close();
  } finally {
    await harness.dispose();
  }
});

it("covers the old-code canary in every captured navigation frame", async () => {
  const harness = await createChromeHarness();

  try {
    const chrome = await harness.launch();
    await enableBlindMode(chrome);
    const fixture = await chrome.openFixture(
      "https://leetcode.cn/problems/two-sum/description/",
      { captureScreencast: true },
    );
    await fixture.page.waitForSelector(
      '[aria-label="Blind Attempt"][data-phase="countdown"]',
    );
    const frames = await fixture.stopScreencast();

    expect(frames.length).toBeGreaterThan(0);
    const magentaPixelCounts = await Promise.all(
      frames.map((frame) =>
        fixture.page.evaluate(async (pngBase64) => {
          const image = new Image();
          image.src = `data:image/png;base64,${pngBase64}`;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          const context = canvas.getContext("2d", { willReadFrequently: true });

          if (!context) {
            throw new Error("Canvas pixel context is unavailable");
          }

          context.drawImage(image, 0, 0);
          const pixels = context.getImageData(
            0,
            0,
            canvas.width,
            canvas.height,
          ).data;
          let magentaPixels = 0;
          for (let index = 0; index < pixels.length; index += 4) {
            if (
              (pixels[index] ?? 0) > 220 &&
              (pixels[index + 1] ?? 255) < 60 &&
              (pixels[index + 2] ?? 0) > 180
            ) {
              magentaPixels += 1;
            }
          }
          return magentaPixels;
        }, frame),
      ),
    );

    expect(magentaPixelCounts).toEqual(frames.map(() => 0));

    await fixture.page.close();
    await chrome.close();
  } finally {
    await harness.dispose();
  }
});

it.each(["button", "enter"] as const)(
  "keeps the production Reset path hard-closed after %s intent",
  async (source) => {
    const harness = await createChromeHarness();

    try {
      const chrome = await harness.launch();
      await enableBlindMode(chrome);
      const fixture = await chrome.openFixture(
        "https://leetcode.cn/problems/two-sum/description/",
      );
      await fixture.page.waitForSelector(
        '[aria-label="Blind Attempt"][data-phase="countdown"]',
      );

      if (source === "button") {
        const resetButton = await fixture.page.waitForSelector(
          'button[aria-label="立即盲重置"]',
        );

        if (!resetButton) {
          throw new Error("Blind Restart control is missing");
        }
        await resetButton.click();
      } else {
        await fixture.page.keyboard.press("Enter");
      }

      await fixture.page.waitForSelector(
        '[aria-label="Blind Attempt"][data-phase="guarded-failure"]',
      );
      await fixture.page.keyboard.press("Enter");
      await fixture.page.keyboard.press("Enter");
      const snapshot = await fixture.page.evaluate(() => {
        const guard = document.querySelector('[aria-label="Blind Attempt"]');
        const fixtureEvents = (
          globalThis as typeof globalThis & { fixtureEvents?: string[] }
        ).fixtureEvents;
        const workspace = document.querySelector(
          '[aria-label="Coding workspace"]',
        );

        return {
          fixtureEvents: fixtureEvents ?? [],
          guardPhase: guard?.getAttribute("data-phase"),
          workspaceInert:
            workspace instanceof HTMLElement ? workspace.inert : false,
        };
      });

      expect(snapshot).toEqual({
        fixtureEvents: [],
        guardPhase: "guarded-failure",
        workspaceInert: true,
      });

      await fixture.page.close();
      await chrome.close();
    } finally {
      await harness.dispose();
    }
  },
);

it.each(["button", "escape"] as const)(
  "creates a latched Bypassed Entry through %s",
  async (source) => {
    const harness = await createChromeHarness();

    try {
      const chrome = await harness.launch();
      await enableBlindMode(chrome);
      const fixture = await chrome.openFixture(
        "https://leetcode.cn/problems/two-sum/description/",
      );
      await fixture.page.waitForSelector(
        '[aria-label="Blind Attempt"][data-phase="countdown"]',
      );

      if (source === "button") {
        const bypassButton = await fixture.page.waitForSelector(
          'button[aria-label="保留当前草稿"]',
        );

        if (!bypassButton) {
          throw new Error("Attempt Bypass control is missing");
        }
        await bypassButton.click();
      } else {
        await fixture.page.keyboard.press("Escape");
      }

      await expect
        .poll(
          () =>
            fixture.page.evaluate(
              () => !document.querySelector('[aria-label="Blind Attempt"]'),
            ),
          { interval: 25, timeout: 2_000 },
        )
        .toBe(true);
      await fixture.page.evaluate(() => {
        const workspace = document.querySelector(
          '[aria-label="Coding workspace"]',
        );

        if (!(workspace instanceof HTMLElement)) {
          throw new Error("Coding Workspace is missing");
        }

        const previousEditor = workspace.querySelector(
          '[aria-label="Code editor"]',
        );
        previousEditor?.remove();
        const replacement = document.createElement("div");
        replacement.setAttribute("role", "textbox");
        replacement.setAttribute("aria-label", "Code editor");
        replacement.append(document.createTextNode("REMOUNTED_CODE_CANARY"));
        workspace.append(replacement);
        for (let index = 0; index < 25; index += 1) {
          workspace.toggleAttribute("data-dom-storm", index % 2 === 0);
        }
      });
      await fixture.page.keyboard.press("Enter");
      await fixture.page.keyboard.press("Escape");
      const snapshot = await fixture.page.evaluate(() => {
        const workspace = document.querySelector(
          '[aria-label="Coding workspace"]',
        );
        const fixtureEvents = (
          globalThis as typeof globalThis & { fixtureEvents?: string[] }
        ).fixtureEvents;

        if (!(workspace instanceof HTMLElement)) {
          throw new Error("Coding Workspace is missing");
        }

        return {
          fixtureEvents: fixtureEvents ?? [],
          guardExists: Boolean(
            document.querySelector('[aria-label="Blind Attempt"]'),
          ),
          workspaceAriaHidden: workspace.getAttribute("aria-hidden"),
          workspaceInert: workspace.inert,
        };
      });

      expect(snapshot).toEqual({
        fixtureEvents: ["page-keydown:Enter", "page-keydown:Escape"],
        guardExists: false,
        workspaceAriaHidden: null,
        workspaceInert: false,
      });
      expect(fixture.unexpectedRequests).toEqual([]);

      await fixture.page.close();
      await chrome.close();
    } finally {
      await harness.dispose();
    }
  },
);

it("neutralizes active controllers before publishing Blind Mode off", async () => {
  const harness = await createChromeHarness();

  try {
    const chrome = await harness.launch();
    await enableBlindMode(chrome);
    const activeFixture = await chrome.openFixture(
      "https://leetcode.cn/problems/two-sum/description/",
    );
    await activeFixture.page.waitForSelector(
      '[aria-label="Blind Attempt"][data-phase="countdown"]',
    );

    await disableBlindMode(chrome);
    await expect
      .poll(
        () =>
          activeFixture.page.evaluate(
            () => !document.querySelector('[aria-label="Blind Attempt"]'),
          ),
        { interval: 25, timeout: 2_000 },
      )
      .toBe(true);
    expect(await chrome.readRegisteredContentScripts()).toEqual([]);
    expect(
      await activeFixture.page.evaluate(() => {
        const workspace = document.querySelector(
          '[aria-label="Coding workspace"]',
        );

        if (!(workspace instanceof HTMLElement)) {
          throw new Error("Coding Workspace is missing");
        }

        return {
          ariaHidden: workspace.getAttribute("aria-hidden"),
          inert: workspace.inert,
        };
      }),
    ).toEqual({ ariaHidden: null, inert: false });
    const newFixture = await chrome.openFixture(
      "https://leetcode.cn/problems/add-two-numbers/description/",
    );
    expect(
      await newFixture.page.evaluate(() => ({
        guardExists: Boolean(
          document.querySelector('[aria-label="Blind Attempt"]'),
        ),
        fixtureEvents:
          (
            globalThis as typeof globalThis & { fixtureEvents?: string[] }
          ).fixtureEvents ?? [],
      })),
    ).toEqual({ guardExists: false, fixtureEvents: [] });

    await newFixture.page.close();
    await activeFixture.page.close();
    await chrome.close();
  } finally {
    await harness.dispose();
  }
});

it("can start a new guarded generation after disabling the same Document", async () => {
  const harness = await createChromeHarness();

  try {
    const chrome = await harness.launch();
    await enableBlindMode(chrome);
    const fixture = await chrome.openFixture(
      "https://leetcode.cn/problems/two-sum/description/",
    );
    await fixture.page.waitForSelector(
      '[aria-label="Blind Attempt"][data-phase="countdown"]',
    );
    await disableBlindMode(chrome);
    await enableBlindMode(chrome, fixture.page);
    await fixture.page.waitForSelector(
      '[aria-label="Blind Attempt"][data-phase="countdown"]',
    );
    expect(
      await fixture.page.evaluate(
        () =>
          (
            globalThis as typeof globalThis & { fixtureEvents?: string[] }
          ).fixtureEvents ?? [],
      ),
    ).toEqual([]);

    await fixture.page.close();
    await chrome.close();
  } finally {
    await harness.dispose();
  }
});

it.each([
  { candidateCount: 0, label: "missing" },
  { candidateCount: 2, label: "ambiguous" },
] as const)(
  "keeps the full viewport guarded when the Coding Workspace is $label",
  async ({ candidateCount }) => {
    const harness = await createChromeHarness();

    try {
      const chrome = await harness.launch();
      await enableBlindMode(chrome);
      const fixture = await chrome.openFixture(
        "https://leetcode.cn/problems/two-sum/description/",
        { workspaceCount: candidateCount },
      );
      await fixture.page.waitForSelector(
        '[aria-label="Blind Attempt"][data-phase="guarded-failure"]',
      );
      const snapshot = await fixture.page.evaluate(() => {
        const guard = document.querySelector('[aria-label="Blind Attempt"]');
        const fixtureEvents = (
          globalThis as typeof globalThis & { fixtureEvents?: string[] }
        ).fixtureEvents;

        if (!(guard instanceof HTMLElement)) {
          throw new Error("Editor Guard is missing");
        }

        const bounds = guard.getBoundingClientRect();
        return {
          accessibleName: guard.getAttribute("aria-label"),
          bounds: {
            height: Math.round(bounds.height),
            left: Math.round(bounds.left),
            top: Math.round(bounds.top),
            width: Math.round(bounds.width),
          },
          fixtureEvents: fixtureEvents ?? [],
          viewport: {
            height: window.innerHeight,
            width: window.innerWidth,
          },
        };
      });

      expect(snapshot).toEqual({
        accessibleName: "Blind Attempt",
        bounds: {
          height: snapshot.viewport.height,
          left: 0,
          top: 0,
          width: snapshot.viewport.width,
        },
        fixtureEvents: [],
        viewport: snapshot.viewport,
      });

      await fixture.page.close();
      await chrome.close();
    } finally {
      await harness.dispose();
    }
  },
);

it("isolates focus and provides Escape from an ambiguous full-viewport Failure", async () => {
  const harness = await createChromeHarness();

  try {
    const chrome = await harness.launch();
    await enableBlindMode(chrome);
    const fixture = await chrome.openFixture(
      "https://leetcode.cn/problems/two-sum/description/",
      { workspaceCount: 2 },
    );
    await fixture.page.waitForSelector(
      '[aria-label="Blind Attempt"][data-phase="guarded-failure"]',
    );
    await fixture.page.focus("#old-code-canary");
    expect(
      await fixture.page.evaluate(() =>
        document.activeElement?.getAttribute("aria-label"),
      ),
    ).toBe("Blind Attempt");

    await fixture.page.keyboard.press("Escape");
    await expect
      .poll(() => chrome.readExtensionStorage(), { interval: 25, timeout: 5_000 })
      .toMatchObject({
        local: { persistentConfiguration: { blindMode: "off" } },
      });
    expect(
      await fixture.page.evaluate(() => ({
        fixtureEvents:
          (
            globalThis as typeof globalThis & { fixtureEvents?: string[] }
          ).fixtureEvents ?? [],
        guardExists: Boolean(
          document.querySelector('[aria-label="Blind Attempt"]'),
        ),
      })),
    ).toEqual({ fixtureEvents: [], guardExists: false });

    await fixture.page.close();
    await chrome.close();
  } finally {
    await harness.dispose();
  }
});
