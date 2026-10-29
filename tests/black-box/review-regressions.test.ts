import { expect, it } from "vitest";
import type { Page, WebWorker } from "puppeteer-core";

import { createChromeHarness, type RunningChrome } from "./chrome-harness.js";

const PRACTICE_URL = "https://leetcode.cn/problems/two-sum/description/";
const GUARD = '[aria-label="Blind Attempt"]';

async function enable(chrome: RunningChrome): Promise<void> {
  const popup = await chrome.openPopup();
  await popup.waitForSelector('button[aria-label="启用 Blind Mode"]:not([disabled])');
  await popup.click("button");
  await expect.poll(() => chrome.readExtensionStorage()).toMatchObject({
    local: { persistentConfiguration: { blindMode: "on" } },
  });
  await popup.close();
}

async function extensionWorker(popup: Page): Promise<WebWorker> {
  const url = new URL(popup.url());
  const origin = `${url.protocol}//${url.host}/`;
  const target = await popup.browser().waitForTarget(
    (candidate) => candidate.type() === "service_worker" && candidate.url().startsWith(origin),
  );
  const worker = await target.worker();
  if (!worker) throw new Error("Extension worker is unavailable");
  return worker;
}

async function settleLayout(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

it("keeps the Workspace Guard aligned when the page changes its layout", async () => {
  const harness = await createChromeHarness();
  try {
    const chrome = await harness.launch();
    await enable(chrome);
    const { page } = await chrome.openFixture(PRACTICE_URL);
    await page.waitForSelector(`${GUARD}[data-phase="countdown"]`);
    await page.keyboard.press("Enter");
    await page.waitForSelector(`${GUARD}[data-phase="guarded-failure"]`);
    await page.$eval("#fixture-root", (element) => {
      (element as HTMLElement).style.gridTemplateColumns = "20% 80%";
    });
    await settleLayout(page);
    expect(await page.evaluate(() => {
      const guard = document.querySelector('[aria-label="Blind Attempt"]')!.getBoundingClientRect();
      const workspace = document.querySelector("#coding-workspace")!.getBoundingClientRect();
      return guard.left <= workspace.left && guard.top <= workspace.top &&
        guard.right >= workspace.right && guard.bottom >= workspace.bottom;
    })).toBe(true);
  } finally {
    await harness.dispose();
  }
});

it("restores viewport protection when the guarded Workspace is replaced", async () => {
  const harness = await createChromeHarness();
  try {
    const chrome = await harness.launch();
    await enable(chrome);
    const { page } = await chrome.openFixture(PRACTICE_URL);
    await page.waitForSelector(`${GUARD}[data-phase="countdown"]`);
    await page.keyboard.press("Enter");
    await page.waitForSelector(`${GUARD}[data-phase="guarded-failure"]`);
    await page.$eval("#coding-workspace", (workspace) => {
      const replacement = workspace.cloneNode(true) as HTMLElement;
      replacement.inert = false;
      replacement.removeAttribute("aria-hidden");
      replacement.style.removeProperty("opacity");
      workspace.replaceWith(replacement);
    });
    await settleLayout(page);
    expect(await page.evaluate(() => {
      const bounds = document.querySelector('[aria-label="Blind Attempt"]')!.getBoundingClientRect();
      return bounds.left === 0 && bounds.top === 0 &&
        bounds.width === innerWidth && bounds.height === innerHeight;
    })).toBe(true);
    await page.focus("#old-code-canary");
    expect(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")))
      .toBe("Blind Attempt");
  } finally {
    await harness.dispose();
  }
});

it("allows Tab navigation and Space activation within the Guard", async () => {
  const harness = await createChromeHarness();
  try {
    const chrome = await harness.launch();
    await enable(chrome);
    const { page } = await chrome.openFixture(PRACTICE_URL);
    await page.waitForSelector(`${GUARD}[data-phase="countdown"]`);
    await page.keyboard.down("Shift");
    await page.keyboard.press("Tab");
    await page.keyboard.up("Shift");
    expect(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")))
      .toBe("立即盲重置");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Space");
    await expect.poll(() => page.$(GUARD)).toBeNull();
    expect(await page.$eval("#coding-workspace", (workspace) => (workspace as HTMLElement).inert))
      .toBe(false);
  } finally {
    await harness.dispose();
  }
});

it.each([
  "/problems/two-sum/solutions/",
  "/problemset/",
])("neutralizes an injected controller after the Document navigates to %s", async (route) => {
  const harness = await createChromeHarness();
  try {
    const chrome = await harness.launch();
    await enable(chrome);
    const { page } = await chrome.openFixture(PRACTICE_URL);
    await page.waitForSelector(`${GUARD}[data-phase="countdown"]`);
    await page.evaluate((pathname) => history.pushState(null, "", pathname), route);
    const popup = await chrome.openPopup();
    await popup.waitForSelector('button[aria-label="关闭 Blind Mode"]:not([disabled])');
    await popup.click("button");
    await expect.poll(() => chrome.readExtensionStorage()).toMatchObject({
      local: { persistentConfiguration: { blindMode: "off" } },
    });
    expect(await page.$(GUARD)).toBeNull();
    expect(await page.$eval("#coding-workspace", (workspace) => (workspace as HTMLElement).inert))
      .toBe(false);
  } finally {
    await harness.dispose();
  }
});

it("continues cleanup after an unregister failure and lets the user retry disabling", async () => {
  const harness = await createChromeHarness();
  try {
    const chrome = await harness.launch();
    await enable(chrome);
    const { page } = await chrome.openFixture(PRACTICE_URL);
    await page.waitForSelector(`${GUARD}[data-phase="countdown"]`);
    await chrome.writeExtensionStorage({}, { diagnostics: [{ code: "synthetic-session" }] });
    const popup = await chrome.openPopup();
    await popup.waitForSelector('button[aria-label="关闭 Blind Mode"]:not([disabled])');
    const worker = await extensionWorker(popup);
    await worker.evaluate(() => {
      const original = globalThis.chrome.scripting.unregisterContentScripts;
      Object.defineProperty(globalThis.chrome.scripting, "unregisterContentScripts", {
        configurable: true,
        value: () => {
          Object.defineProperty(globalThis.chrome.scripting, "unregisterContentScripts", { configurable: true, value: original });
          return Promise.reject(new Error("Synthetic unregister failure"));
        },
      });
    });
    await popup.click("button");
    await expect.poll(() => page.$(GUARD)).toBeNull();
    await expect.poll(() => chrome.readExtensionStorage()).toMatchObject({
      local: { persistentConfiguration: { blindMode: "disabling" } },
      session: {},
    });
    await popup.waitForSelector('button[aria-label="关闭 Blind Mode"]:not([disabled])');
    await popup.click("button");
    await expect.poll(() => chrome.readExtensionStorage()).toMatchObject({
      local: { persistentConfiguration: { blindMode: "off" } },
      session: {},
    });
    expect(await chrome.readRegisteredContentScripts()).toEqual([]);
  } finally {
    await harness.dispose();
  }
});

it("recovers popup controls after a rejected runtime message", async () => {
  const harness = await createChromeHarness();
  try {
    const chrome = await harness.launch();
    const popup = await chrome.openPopup();
    await popup.waitForSelector('button[aria-label="启用 Blind Mode"]:not([disabled])');
    await popup.evaluate(() => {
      const original = globalThis.chrome.runtime.sendMessage;
      Object.defineProperty(globalThis.chrome.runtime, "sendMessage", {
        configurable: true,
        value: () => {
          Object.defineProperty(globalThis.chrome.runtime, "sendMessage", { configurable: true, value: original });
          return Promise.reject(new Error("Synthetic message failure"));
        },
      });
    });
    await popup.click("button");
    await popup.waitForSelector("button:not([disabled])");
    expect(await popup.$eval('[role="status"]', (status) => status.textContent)).toMatch(/重试/u);
    await popup.click("button");
    await popup.waitForSelector('button[aria-label="启用 Blind Mode"]:not([disabled])');
    await popup.click("button");
    await expect.poll(() => chrome.readExtensionStorage()).toMatchObject({
      local: { persistentConfiguration: { blindMode: "on" } },
    });
  } finally {
    await harness.dispose();
  }
});

it("fails closed for an unsupported configuration schema on restart", async () => {
  const harness = await createChromeHarness();
  try {
    let chrome = await harness.launch();
    const popup = await chrome.openPopup();
    await popup.waitForSelector("button:not([disabled])");
    await chrome.writeExtensionStorage({
      persistentConfiguration: { schemaVersion: 99, blindMode: "on", countdownMs: 5_000 },
    }, {});
    await chrome.close();
    chrome = await harness.launch();
    await expect.poll(() => chrome.readExtensionStorage()).toMatchObject({
      local: { persistentConfiguration: { schemaVersion: 1, blindMode: "off", countdownMs: 5_000 } },
    });
    expect(await chrome.readRegisteredContentScripts()).toEqual([]);
  } finally {
    await harness.dispose();
  }
});

it("does not publish off when controller neutralization was not acknowledged", async () => {
  const harness = await createChromeHarness();
  try {
    const chrome = await harness.launch();
    await enable(chrome);
    const { page } = await chrome.openFixture(PRACTICE_URL);
    await page.waitForSelector(`${GUARD}[data-phase="countdown"]`);
    const popup = await chrome.openPopup();
    await popup.waitForSelector('button[aria-label="关闭 Blind Mode"]:not([disabled])');
    const worker = await extensionWorker(popup);
    await worker.evaluate(() => {
      const original = globalThis.chrome.tabs.sendMessage;
      Object.defineProperty(globalThis.chrome.tabs, "sendMessage", {
        configurable: true,
        value: (...args: unknown[]) => {
          const message = args[1] as { type?: string } | undefined;
          if (message?.type === "neutralize-guarded-runtime") {
            Object.defineProperty(globalThis.chrome.tabs, "sendMessage", { configurable: true, value: original });
            return Promise.reject(new Error("Synthetic message delivery failure"));
          }
          return Reflect.apply(original, globalThis.chrome.tabs, args);
        },
      });
    });
    await popup.click("button");
    await popup.waitForSelector('button[aria-label="关闭 Blind Mode"]:not([disabled])');
    expect(await chrome.readExtensionStorage()).toMatchObject({
      local: { persistentConfiguration: { blindMode: "disabling" } },
    });
    await popup.click("button");
    await expect.poll(() => chrome.readExtensionStorage()).toMatchObject({
      local: { persistentConfiguration: { blindMode: "off" } },
    });
    expect(await page.$(GUARD)).toBeNull();
  } finally {
    await harness.dispose();
  }
});

it("serializes competing Blind Mode commands without leaving a registration or Guard", async () => {
  const harness = await createChromeHarness();
  try {
    const chrome = await harness.launch();
    const popup = await chrome.openPopup();
    await popup.waitForSelector("button:not([disabled])");
    const responses = await popup.evaluate(async () => Promise.all(
      [true, false, true, false].map((enabled) =>
        globalThis.chrome.runtime.sendMessage({ type: "set-blind-mode", enabled })),
    ));
    expect(responses.map((response: { ok: boolean }) => response.ok)).toEqual([true, true, true, true]);
    expect(await chrome.readRegisteredContentScripts()).toEqual([]);
    expect(await chrome.readExtensionStorage()).toMatchObject({
      local: { persistentConfiguration: { blindMode: "off" } }, session: {},
    });
  } finally {
    await harness.dispose();
  }
});

it("still cancels and cleans the page when a configuration read fails during disabling", async () => {
  const harness = await createChromeHarness();
  try {
    const chrome = await harness.launch();
    await enable(chrome);
    const { page } = await chrome.openFixture(PRACTICE_URL);
    await page.waitForSelector(`${GUARD}[data-phase="countdown"]`);
    const popup = await chrome.openPopup();
    await popup.waitForSelector('button[aria-label="关闭 Blind Mode"]:not([disabled])');
    const worker = await extensionWorker(popup);
    await worker.evaluate(() => {
      const original = globalThis.chrome.storage.local.get;
      Object.defineProperty(globalThis.chrome.storage.local, "get", {
        configurable: true,
        value: () => {
          Object.defineProperty(globalThis.chrome.storage.local, "get", { configurable: true, value: original });
          return Promise.reject(new Error("Synthetic configuration read failure"));
        },
      });
    });
    await popup.click("button");
    await popup.waitForSelector('button[aria-label="关闭 Blind Mode"]:not([disabled])');
    expect(await page.$(GUARD)).toBeNull();
    expect(await chrome.readRegisteredContentScripts()).toEqual([]);
    await popup.click("button");
    await expect.poll(() => chrome.readExtensionStorage()).toMatchObject({
      local: { persistentConfiguration: { blindMode: "off" } }, session: {},
    });
  } finally {
    await harness.dispose();
  }
});
