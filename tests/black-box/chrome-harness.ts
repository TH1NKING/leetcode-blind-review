import { access, cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import puppeteer, {
  type Browser,
  type CDPSession,
  type Page,
  type WebWorker,
} from "puppeteer-core";

import { createLeetCodeFixtureHtml } from "./leetcode-fixture.js";

const EXTENSION_DIRECTORY = path.resolve("dist/extension");
const PACKAGE_PREFIX = "leetcode-blind-review-package-";
const PROFILE_PREFIX = "leetcode-blind-review-";

export interface ChromeHarnessOptions {
  readonly omitExtensionFiles?: readonly string[];
}

export interface ExtensionStorageSnapshot {
  readonly local: Record<string, unknown>;
  readonly session: Record<string, unknown>;
}

export interface FixturePage {
  readonly page: Page;
  readonly unexpectedRequests: readonly string[];
  stopScreencast(): Promise<readonly string[]>;
}

export interface FixtureOptions {
  readonly captureScreencast?: boolean;
  readonly openInBackground?: boolean;
  readonly workspaceCount?: number;
}

export interface RunningChrome {
  readonly browserVersion: string;
  readonly extensionMetadata: {
    readonly name: string;
    readonly version: string;
  };
  close(): Promise<void>;
  getServiceWorkerRequests(): readonly string[];
  openPopup(): Promise<Page>;
  openFixture(url: string, options?: FixtureOptions): Promise<FixturePage>;
  readRegisteredContentScripts(): Promise<
    readonly chrome.scripting.RegisteredContentScript[]
  >;
  replaceRegisteredContentScript(
    script: chrome.scripting.RegisteredContentScript,
  ): Promise<void>;
  readExtensionStorage(): Promise<ExtensionStorageSnapshot>;
  writeExtensionStorage(
    local: Record<string, unknown>,
    session: Record<string, unknown>,
  ): Promise<void>;
}

export interface ChromeHarness {
  dispose(): Promise<void>;
  launch(): Promise<RunningChrome>;
}

async function resolveChromeStablePath(): Promise<string> {
  const configuredPath = process.env["CHROME_STABLE_PATH"];
  const candidates = configuredPath
    ? [configuredPath]
    : process.platform === "win32"
      ? ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"]
      : process.platform === "darwin"
        ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
        : ["/usr/bin/google-chrome"];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next explicit Chrome Stable location.
    }
  }

  throw new Error(
    "Google Chrome Stable was not found; set CHROME_STABLE_PATH explicitly",
  );
}

function assertTemporaryPath(directory: string, prefix: string): void {
  const relativePath = path.relative(path.resolve(tmpdir()), directory);

  if (
    relativePath.length === 0 ||
    relativePath.startsWith("..") ||
    path.isAbsolute(relativePath) ||
    !path.basename(directory).startsWith(prefix)
  ) {
    throw new Error("Refusing to remove a directory outside the test temp root");
  }
}

async function waitForExtensionWorker(
  browser: Browser,
  extensionId: string,
): Promise<{ readonly session: CDPSession; readonly worker: WebWorker }> {
  const workerTarget = await browser.waitForTarget(
    (target) =>
      target.type() === "service_worker" &&
      target.url().startsWith(`chrome-extension://${extensionId}/`),
  );
  const worker = await workerTarget.worker();

  if (!worker) {
    throw new Error("The MV3 extension Service Worker did not start");
  }

  return {
    session: await workerTarget.createCDPSession(),
    worker,
  };
}

export async function createChromeHarness(
  options: ChromeHarnessOptions = {},
): Promise<ChromeHarness> {
  const profileDirectory = await mkdtemp(
    path.join(path.resolve(tmpdir()), PROFILE_PREFIX),
  );
  const packageDirectory = await mkdtemp(
    path.join(path.resolve(tmpdir()), PACKAGE_PREFIX),
  );
  const packagedExtensionDirectory = path.join(packageDirectory, "extension");
  await cp(EXTENSION_DIRECTORY, packagedExtensionDirectory, { recursive: true });
  for (const file of options.omitExtensionFiles ?? []) {
    if (path.basename(file) !== file) {
      throw new Error("Extension omission must name one package-root file");
    }
    await rm(path.join(packagedExtensionDirectory, file), { force: true });
  }
  const chromePath = await resolveChromeStablePath();
  let activeBrowser: Browser | undefined;

  return {
    async launch(): Promise<RunningChrome> {
      if (activeBrowser) {
        throw new Error("Chrome is already running for this harness");
      }

      const browser = await puppeteer.launch({
        browser: "chrome",
        enableExtensions: true,
        executablePath: chromePath,
        headless: process.env["LBR_HEADED"] !== "1",
        pipe: true,
        userDataDir: profileDirectory,
      });
      activeBrowser = browser;

      const extensionId = await browser.installExtension(
        packagedExtensionDirectory,
      );
      const extension = (await browser.extensions()).get(extensionId);

      if (!extension || !extension.enabled) {
        await browser.close();
        activeBrowser = undefined;
        throw new Error("The packaged extension was not installed and enabled");
      }

      const { session, worker } = await waitForExtensionWorker(
        browser,
        extensionId,
      );
      const serviceWorkerRequests: string[] = [];
      await session.send("Network.enable");
      session.on("Network.requestWillBeSent", ({ request }) => {
        if (/^https?:/u.test(request.url)) {
          serviceWorkerRequests.push(request.url);
        }
      });

      return {
        browserVersion: await browser.version(),
        extensionMetadata: {
          name: extension.name,
          version: extension.version,
        },
        async close(): Promise<void> {
          await browser.close();
          activeBrowser = undefined;
        },
        getServiceWorkerRequests(): readonly string[] {
          return [...serviceWorkerRequests];
        },
        async openPopup(): Promise<Page> {
          const page = await browser.newPage();
          await page.goto(`chrome-extension://${extensionId}/popup.html`);
          return page;
        },
        async openFixture(
          url: string,
          options: FixtureOptions = {},
        ): Promise<FixturePage> {
          const page = await browser.newPage();
          if (options.openInBackground) {
            await browser.newPage();
          }
          const unexpectedRequests: string[] = [];
          const screencastFrames: string[] = [];
          const screencastSession = options.captureScreencast
            ? await page.createCDPSession()
            : undefined;
          let resolveFirstScreencastFrame: (() => void) | undefined;
          const firstScreencastFrame = screencastSession
            ? new Promise<void>((resolve) => {
                resolveFirstScreencastFrame = resolve;
              })
            : undefined;
          let screencastRunning = false;

          if (screencastSession) {
            await screencastSession.send("Page.enable");
            screencastSession.on(
              "Page.screencastFrame",
              ({ data, sessionId }) => {
                screencastFrames.push(data);
                resolveFirstScreencastFrame?.();
                resolveFirstScreencastFrame = undefined;
                void screencastSession.send("Page.screencastFrameAck", {
                  sessionId,
                });
              },
            );
            await screencastSession.send("Page.startScreencast", {
              everyNthFrame: 1,
              format: "png",
              quality: 100,
            });
            screencastRunning = true;
          }
          await page.setRequestInterception(true);
          page.on("request", (request) => {
            const requestUrl = request.url();

            if (requestUrl.startsWith("https://leetcode.cn/")) {
              void request.respond({
                body: createLeetCodeFixtureHtml(options.workspaceCount ?? 1),
                contentType: "text/html; charset=utf-8",
                status: 200,
              });
              return;
            }

            if (/^https?:/u.test(requestUrl)) {
              unexpectedRequests.push(requestUrl);
              void request.abort();
              return;
            }

            void request.continue();
          });
          await page.goto(url, { waitUntil: "domcontentloaded" });

          return {
            page,
            unexpectedRequests,
            async stopScreencast(): Promise<readonly string[]> {
              if (screencastSession && screencastRunning) {
                await page.evaluate(
                  () =>
                    new Promise<void>((resolve) => {
                      requestAnimationFrame(() => resolve());
                    }),
                );
                if (firstScreencastFrame && screencastFrames.length === 0) {
                  let deliveryDeadline: ReturnType<typeof setTimeout> | undefined;
                  try {
                    await Promise.race([
                      firstScreencastFrame,
                      new Promise<never>((_resolve, reject) => {
                        deliveryDeadline = setTimeout(
                          () => reject(new Error("Chrome did not deliver a screencast frame")),
                          2_000,
                        );
                      }),
                    ]);
                  } finally {
                    if (deliveryDeadline) {
                      clearTimeout(deliveryDeadline);
                    }
                  }
                }
                await screencastSession.send("Page.stopScreencast");
                screencastRunning = false;
              }
              return [...screencastFrames];
            },
          };
        },
        async readRegisteredContentScripts(): Promise<
          readonly chrome.scripting.RegisteredContentScript[]
        > {
          return worker.evaluate(() =>
            chrome.scripting.getRegisteredContentScripts(),
          );
        },
        async replaceRegisteredContentScript(
          script: chrome.scripting.RegisteredContentScript,
        ): Promise<void> {
          await worker.evaluate(async (replacement) => {
            const registered =
              await chrome.scripting.getRegisteredContentScripts({
                ids: [replacement.id],
              });
            if (registered.length > 0) {
              await chrome.scripting.unregisterContentScripts({
                ids: [replacement.id],
              });
            }
            await chrome.scripting.registerContentScripts([replacement]);
          }, script);
        },
        async readExtensionStorage(): Promise<ExtensionStorageSnapshot> {
          return worker.evaluate(async () => ({
            local: await chrome.storage.local.get(null),
            session: await chrome.storage.session.get(null),
          }));
        },
        async writeExtensionStorage(
          local: Record<string, unknown>,
          sessionStorage: Record<string, unknown>,
        ): Promise<void> {
          await worker.evaluate(
            async (localValues, sessionValues) => {
              await chrome.storage.local.set(localValues);
              await chrome.storage.session.set(sessionValues);
            },
            local,
            sessionStorage,
          );
        },
      };
    },
    async dispose(): Promise<void> {
      if (activeBrowser) {
        await activeBrowser.close();
        activeBrowser = undefined;
      }

      assertTemporaryPath(profileDirectory, PROFILE_PREFIX);
      await rm(profileDirectory, {
        force: true,
        maxRetries: 3,
        recursive: true,
        retryDelay: 100,
      });
      assertTemporaryPath(packageDirectory, PACKAGE_PREFIX);
      await rm(packageDirectory, {
        force: true,
        maxRetries: 3,
        recursive: true,
        retryDelay: 100,
      });
    },
  };
}
