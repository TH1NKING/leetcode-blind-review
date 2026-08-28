export const PERSISTENT_CONFIGURATION_KEY = "persistentConfiguration";

export interface PersistentConfiguration {
  readonly schemaVersion: 1;
  readonly blindMode: "off" | "enabling" | "on" | "disabling";
  readonly countdownMs: number;
}

export const DEFAULT_PERSISTENT_CONFIGURATION: PersistentConfiguration =
  Object.freeze({
    schemaVersion: 1,
    blindMode: "off",
    countdownMs: 5_000,
  });
