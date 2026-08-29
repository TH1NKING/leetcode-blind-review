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
  const enabled = blindMode === "on";
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
  toggleButton.disabled = transitioning;
  toggleButton.dataset.enabled = String(enabled);
}

async function sendModeMessage(message: unknown): Promise<ModeResponse> {
  return chrome.runtime.sendMessage(message) as Promise<ModeResponse>;
}

toggleButton.addEventListener("click", () => {
  const enabled = toggleButton.dataset.enabled === "true";
  toggleButton.disabled = true;
  void sendModeMessage({ type: "set-blind-mode", enabled: !enabled }).then(
    (response) => render(response.blindMode),
  );
});

void sendModeMessage({ type: "get-blind-mode-status" }).then((response) => {
  render(response.blindMode);
});
