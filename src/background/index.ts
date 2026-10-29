import {
  DEFAULT_PERSISTENT_CONFIGURATION,
  PERSISTENT_CONFIGURATION_KEY,
  type PersistentConfiguration,
} from "../config/persistent-configuration.js";

const GUARDED_RUNTIME_ID = "blind-attempt-runtime-v1";
const PRACTICE_MATCH = "https://leetcode.cn/problems/*/description/*";
const GUARDED_RUNTIME: chrome.scripting.RegisteredContentScript = {
  id: GUARDED_RUNTIME_ID,
  allFrames: false,
  css: ["guard.css"],
  js: ["controller.js"],
  matchOriginAsFallback: false,
  matches: [PRACTICE_MATCH],
  persistAcrossSessions: true,
  runAt: "document_start",
  world: "ISOLATED",
};

interface GetBlindModeStatusMessage {
  readonly type: "get-blind-mode-status";
}

interface SetBlindModeMessage {
  readonly type: "set-blind-mode";
  readonly enabled: boolean;
}

type ModeMessage = GetBlindModeStatusMessage | SetBlindModeMessage;

interface ModeResponse {
  readonly ok: boolean;
  readonly blindMode: PersistentConfiguration["blindMode"];
  readonly foregroundEligible: boolean;
}

let initialization: Promise<void> | undefined;
let modeMutationQueue: Promise<void> = Promise.resolve();
let workflowGate: PersistentConfiguration["blindMode"] = "off";

function isModeMessage(value: unknown): value is ModeMessage {
  if (typeof value !== "object" || value === null || !("type" in value)) {
    return false;
  }

  if (value.type === "get-blind-mode-status") {
    return true;
  }

  return (
    value.type === "set-blind-mode" &&
    "enabled" in value &&
    typeof value.enabled === "boolean"
  );
}

function equalStrings(
  left: readonly string[] | undefined,
  right: readonly string[] | undefined,
): boolean {
  const leftValues = left ?? [];
  const rightValues = right ?? [];
  return (
    leftValues.length === rightValues.length &&
    leftValues.every((value, index) => value === rightValues[index])
  );
}

function runtimeMatchesExpected(
  runtime: chrome.scripting.RegisteredContentScript,
): boolean {
  return (
    equalStrings(
      Object.keys(runtime).sort(),
      Object.keys(GUARDED_RUNTIME).sort(),
    ) &&
    runtime.id === GUARDED_RUNTIME.id &&
    (runtime.allFrames ?? false) === GUARDED_RUNTIME.allFrames &&
    equalStrings(runtime.css, GUARDED_RUNTIME.css) &&
    equalStrings(runtime.js, GUARDED_RUNTIME.js) &&
    (runtime.matchOriginAsFallback ?? false) ===
      GUARDED_RUNTIME.matchOriginAsFallback &&
    equalStrings(runtime.matches, GUARDED_RUNTIME.matches) &&
    (runtime.persistAcrossSessions ?? true) ===
      GUARDED_RUNTIME.persistAcrossSessions &&
    runtime.runAt === GUARDED_RUNTIME.runAt &&
    (runtime.world ?? "ISOLATED") === GUARDED_RUNTIME.world
  );
}

async function readConfiguration(): Promise<PersistentConfiguration> {
  const stored = await chrome.storage.local.get(PERSISTENT_CONFIGURATION_KEY);
  const configuration = stored[PERSISTENT_CONFIGURATION_KEY];

  if (
    typeof configuration !== "object" ||
    configuration === null ||
    !("schemaVersion" in configuration) ||
    configuration.schemaVersion !== 1 ||
    !("blindMode" in configuration) ||
    typeof configuration.blindMode !== "string" ||
    !["off", "enabling", "on", "disabling"].includes(configuration.blindMode) ||
    !("countdownMs" in configuration) ||
    typeof configuration.countdownMs !== "number" ||
    !Number.isFinite(configuration.countdownMs) ||
    configuration.countdownMs < 0
  ) {
    await chrome.storage.local.set({
      [PERSISTENT_CONFIGURATION_KEY]: DEFAULT_PERSISTENT_CONFIGURATION,
    });
    return DEFAULT_PERSISTENT_CONFIGURATION;
  }

  return {
    schemaVersion: 1,
    blindMode: configuration.blindMode as PersistentConfiguration["blindMode"],
    countdownMs: configuration.countdownMs,
  };
}

async function persistBlindMode(
  blindMode: PersistentConfiguration["blindMode"],
): Promise<PersistentConfiguration> {
  const current = await readConfiguration();
  const next = { ...current, blindMode };
  await chrome.storage.local.set({ [PERSISTENT_CONFIGURATION_KEY]: next });
  return next;
}

async function getRegisteredRuntime(): Promise<
  chrome.scripting.RegisteredContentScript | undefined
> {
  const registered = await chrome.scripting.getRegisteredContentScripts({
    ids: [GUARDED_RUNTIME_ID],
  });
  return registered[0];
}

async function installGuardedRuntime(): Promise<void> {
  const registered = await getRegisteredRuntime();

  if (registered && runtimeMatchesExpected(registered)) {
    return;
  }

  if (registered) {
    await chrome.scripting.unregisterContentScripts({
      ids: [GUARDED_RUNTIME_ID],
    });
  }
  await chrome.scripting.registerContentScripts([GUARDED_RUNTIME]);
}

async function uninstallGuardedRuntime(): Promise<void> {
  if (!(await getRegisteredRuntime())) {
    return;
  }

  await chrome.scripting.unregisterContentScripts({ ids: [GUARDED_RUNTIME_ID] });
}

async function findActivePracticeTabId(): Promise<number | undefined> {
  const tabs = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
    url: [PRACTICE_MATCH],
  });
  const tabId = tabs[0]?.id;
  return typeof tabId === "number" ? tabId : undefined;
}

async function protectCurrentPracticeView(): Promise<void> {
  const tabId = await findActivePracticeTabId();

  if (tabId === undefined) {
    return;
  }

  let cssInserted = false;
  try {
    await chrome.scripting.insertCSS({
      files: ["guard.css"],
      origin: "AUTHOR",
      target: { tabId },
    });
    cssInserted = true;
    await chrome.scripting.executeScript({
      files: ["controller.js"],
      injectImmediately: true,
      target: { tabId },
    });
    const response: unknown = await chrome.tabs.sendMessage(tabId, {
      type: "guarded-runtime-ready-probe",
    });

    if (
      typeof response !== "object" ||
      response === null ||
      !("ready" in response) ||
      response.ready !== true
    ) {
      throw new Error("The current Practice View did not acknowledge its Guard");
    }
  } catch (error) {
    if (cssInserted) {
      await neutralizePracticeView(tabId);
    }
    throw error;
  }
}

async function sendPracticeViewMessage(
  tabId: number,
  type: "prevent-new-work" | "neutralize-guarded-runtime",
): Promise<void> {
  try {
    const response: unknown = await chrome.tabs.sendMessage(tabId, { type });
    const acknowledgement = type === "prevent-new-work" ? "stopped" : "neutralized";
    if (
      typeof response !== "object" || response === null ||
      !(acknowledgement in response) ||
      (response as Record<string, unknown>)[acknowledgement] !== true
    ) {
      throw new Error("The Document did not acknowledge Blind Mode cleanup");
    }
  } catch (error) {
    if (
      error instanceof Error &&
      /Receiving end does not exist|No tab with id|The tab was closed|The frame was removed|No frame with id/u.test(error.message)
    ) {
      return;
    }
    throw error;
  }
}

async function removeImmediateGuardCss(tabId: number): Promise<void> {
  try {
    await chrome.scripting.removeCSS({
      files: ["guard.css"],
      origin: "AUTHOR",
      target: { tabId },
    });
  } catch {
    // Removing an already-gone Document or stylesheet is cleanup-complete.
  }
}

async function openTabIds(): Promise<readonly number[]> {
  // An injected controller survives same-Document navigation outside its match.
  // Tab IDs need no broad tabs permission, and messages reach only this extension.
  const tabs = await chrome.tabs.query({});
  return tabs.flatMap(({ id }) => (typeof id === "number" ? [id] : []));
}

async function preventNewWorkInPracticeViews(): Promise<void> {
  const tabIds = await openTabIds();
  await Promise.all(
    tabIds.map((tabId) => sendPracticeViewMessage(tabId, "prevent-new-work")),
  );
}

async function neutralizePracticeView(tabId: number): Promise<void> {
  try {
    await sendPracticeViewMessage(tabId, "neutralize-guarded-runtime");
  } finally {
    await removeImmediateGuardCss(tabId);
  }
}

async function neutralizeAllPracticeViews(): Promise<void> {
  const tabIds = await openTabIds();
  await Promise.all(tabIds.map((tabId) => neutralizePracticeView(tabId)));
}

async function settleRuntimeToOff(): Promise<PersistentConfiguration> {
  workflowGate = "disabling";
  let cleanupFailed = false;
  const steps: readonly (() => Promise<unknown>)[] = [
    preventNewWorkInPracticeViews,
    () => persistBlindMode("disabling"),
    uninstallGuardedRuntime,
    neutralizeAllPracticeViews,
    () => chrome.storage.session.clear(),
  ];

  for (const step of steps) {
    try {
      await step();
    } catch {
      // One failed API call must not prevent independent cleanup steps.
      cleanupFailed = true;
    }
  }

  if (cleanupFailed) {
    throw new Error("Blind Mode cleanup is incomplete; disabling can be retried");
  }

  const configuration = await persistBlindMode("off");
  workflowGate = "off";
  return configuration;
}

async function rollbackToOff(): Promise<void> {
  await settleRuntimeToOff();
}

async function reconcileRuntime(): Promise<void> {
  const configuration = await readConfiguration();
  workflowGate = configuration.blindMode;

  if (configuration.blindMode === "on") {
    try {
      await installGuardedRuntime();
      workflowGate = "on";
    } catch {
      await rollbackToOff();
    }
    return;
  }

  if (
    configuration.blindMode === "enabling" ||
    configuration.blindMode === "disabling"
  ) {
    workflowGate = "disabling";
    await rollbackToOff();
    return;
  }

  workflowGate = "off";
  const cleanup = await Promise.allSettled([
    uninstallGuardedRuntime(),
    neutralizeAllPracticeViews(),
    chrome.storage.session.clear(),
  ]);
  if (cleanup.some((result) => result.status === "rejected")) {
    throw new Error("Blind Mode off reconciliation is incomplete");
  }
}

async function initializeExtension(): Promise<void> {
  await Promise.all([
    chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }),
    chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }),
  ]);
  await reconcileRuntime();
}

function startInitialization(): Promise<void> {
  const attempt = (initialization ??= initializeExtension());
  void attempt.catch((error: unknown) => {
    if (initialization === attempt) {
      initialization = undefined;
    }
    console.error("Blind Mode initialization failed", error);
  });
  return attempt;
}

function enqueueModeMutation<T>(mutation: () => Promise<T>): Promise<T> {
  const result = modeMutationQueue.then(async () => {
    await startInitialization();
    return mutation();
  });
  modeMutationQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function enableBlindMode(): Promise<PersistentConfiguration> {
  const current = await readConfiguration();

  if (current.blindMode === "on" && workflowGate === "on") {
    return current;
  }

  workflowGate = "enabling";
  try {
    await persistBlindMode("enabling");
    await installGuardedRuntime();
    await protectCurrentPracticeView();
    const configuration = await persistBlindMode("on");
    workflowGate = "on";
    return configuration;
  } catch (error) {
    await rollbackToOff();
    throw error;
  }
}

async function disableBlindMode(): Promise<PersistentConfiguration> {
  const current = await readConfiguration();

  if (current.blindMode === "off" && workflowGate === "off") {
    return current;
  }

  return settleRuntimeToOff();
}

async function senderIsForeground(
  sender: chrome.runtime.MessageSender,
): Promise<boolean> {
  const tabId = sender.tab?.id;
  const windowId = sender.tab?.windowId;

  if (typeof tabId !== "number" || typeof windowId !== "number") {
    return false;
  }

  const [tab, window] = await Promise.all([
    chrome.tabs.get(tabId),
    chrome.windows.get(windowId),
  ]);
  return tab.active && window.focused;
}

async function handleModeMessage(
  message: ModeMessage,
  sender: chrome.runtime.MessageSender,
): Promise<ModeResponse> {
  try {
    await startInitialization();

    if (message.type === "get-blind-mode-status") {
      return {
        ok: true,
        blindMode: workflowGate,
        foregroundEligible: await senderIsForeground(sender),
      };
    }

    const configuration = await enqueueModeMutation(() =>
      message.enabled ? enableBlindMode() : disableBlindMode(),
    );
    return {
      ok: true,
      blindMode: configuration.blindMode,
      foregroundEligible: false,
    };
  } catch {
    return {
      ok: false,
      blindMode: workflowGate,
      foregroundEligible: false,
    };
  }
}

chrome.runtime.onMessage.addListener(
  (message: unknown, sender, sendResponse: (response: ModeResponse) => void) => {
    if (!isModeMessage(message)) {
      return false;
    }

    void handleModeMessage(message, sender).then(sendResponse);
    return true;
  },
);

chrome.runtime.onInstalled.addListener(() => {
  void startInitialization();
});
chrome.runtime.onStartup.addListener(() => {
  void startInitialization();
});
void startInitialization();
