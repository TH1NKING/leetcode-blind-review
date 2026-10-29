interface ModeResponse {
  readonly ok: boolean;
  readonly blindMode: "off" | "enabling" | "on" | "disabling";
}

function requireElement<T extends Element>(element: T | null): T {
  if (!element) {
    throw new Error("Blind Mode popup controls are missing");
  }

  return element;
}

const statusElement = requireElement(
  document.querySelector<HTMLElement>("[role='status']"),
);
const toggleButton = requireElement(
  document.querySelector<HTMLButtonElement>("button"),
);

function replaceText(element: HTMLElement, value: string): void {
  element.replaceChildren(document.createTextNode(value));
}

function render(blindMode: ModeResponse["blindMode"]): void {
  const enabled = blindMode !== "off";
  const transitioning = blindMode === "enabling" || blindMode === "disabling";

  replaceText(
    statusElement,
    transitioning
      ? "Blind Mode 正在切换"
      : enabled
        ? "Blind Mode 已开启"
        : "Blind Mode 已关闭",
  );
  replaceText(toggleButton, enabled ? "关闭 Blind Mode" : "启用 Blind Mode");
  toggleButton.setAttribute(
    "aria-label",
    enabled ? "关闭 Blind Mode" : "启用 Blind Mode",
  );
  // A failed transition must retain an explicit way to retry disabling.
  toggleButton.disabled = false;
  toggleButton.dataset.enabled = String(enabled);
}

async function sendModeMessage(message: unknown): Promise<ModeResponse> {
  const response: unknown = await chrome.runtime.sendMessage(message);
  if (
    typeof response !== "object" || response === null ||
    !("ok" in response) || typeof response.ok !== "boolean" ||
    !("blindMode" in response) ||
    typeof response.blindMode !== "string" ||
    !["off", "enabling", "on", "disabling"].includes(response.blindMode)
  ) {
    throw new Error("Blind Mode status is unavailable");
  }
  return response as ModeResponse;
}

let retryStatus = false;

async function requestMode(message: unknown): Promise<void> {
  toggleButton.disabled = true;
  try {
    const response = await sendModeMessage(message);
    retryStatus = false;
    render(response.blindMode);
    if (!response.ok) {
      replaceText(statusElement, "Blind Mode 操作未完成，请重试确认当前状态。");
    }
  } catch {
    retryStatus = true;
    replaceText(statusElement, "无法读取 Blind Mode 状态，请重试。");
    replaceText(toggleButton, "重试读取 Blind Mode");
    toggleButton.setAttribute("aria-label", "重试读取 Blind Mode");
    toggleButton.disabled = false;
  }
}

toggleButton.addEventListener("click", () => {
  const enabled = toggleButton.dataset.enabled === "true";
  void requestMode(retryStatus
    ? { type: "get-blind-mode-status" }
    : { type: "set-blind-mode", enabled: !enabled });
});

void requestMode({ type: "get-blind-mode-status" });
