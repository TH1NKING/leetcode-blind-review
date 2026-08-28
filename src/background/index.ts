import {
  DEFAULT_PERSISTENT_CONFIGURATION,
  PERSISTENT_CONFIGURATION_KEY,
} from "../config/persistent-configuration.js";

let storageInitialization: Promise<void> | undefined;

async function initializeStorage(): Promise<void> {
  await Promise.all([
    chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }),
    chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }),
  ]);

  const storedConfiguration = await chrome.storage.local.get(
    PERSISTENT_CONFIGURATION_KEY,
  );

  if (!Object.hasOwn(storedConfiguration, PERSISTENT_CONFIGURATION_KEY)) {
    await chrome.storage.local.set({
      [PERSISTENT_CONFIGURATION_KEY]: DEFAULT_PERSISTENT_CONFIGURATION,
    });
  }
}

function startStorageInitialization(): void {
  storageInitialization ??= initializeStorage();
  void storageInitialization.catch((error: unknown) => {
    console.error("Blind Mode storage initialization failed", error);
  });
}

chrome.runtime.onInstalled.addListener(startStorageInitialization);
chrome.runtime.onStartup.addListener(startStorageInitialization);
startStorageInitialization();
