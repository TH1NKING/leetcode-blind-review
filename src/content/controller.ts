import {
  createInitialLifecycleState,
  transitionLifecycle,
  type LifecycleCommand,
  type LifecycleEvent,
  type LifecycleState,
  type WorkflowRef,
} from "../lifecycle/index.js";

const CONTROLLER_MARKER = "data-lbr-controller-v1";
const FOREGROUND_ELIGIBLE_MARKER = "data-lbr-foreground-eligible";
const GUARD_MOUNTED_MARKER = "data-lbr-guard-mounted";
const NEUTRALIZED_MARKER = "data-lbr-guard-neutralized";
const WORKSPACE_SELECTOR = '[role="region"][aria-label="Coding workspace"]';

type ControllerGlobal = typeof globalThis & {
  lbrDocumentControllerV1?: DocumentController;
};

function appendText(element: HTMLElement, value: string): void {
  element.replaceChildren(document.createTextNode(value));
}

function createEnabledLifecycleState(): LifecycleState {
  const events: readonly LifecycleEvent[] = [
    { type: "enable-requested", operationId: 1 },
    { type: "mode-persisted", operationId: 1, value: "enabling" },
    { type: "guarded-runtime-installed", operationId: 1 },
    { type: "mode-persisted", operationId: 1, value: "on" },
  ];
  let state = createInitialLifecycleState();

  for (const event of events) {
    state = transitionLifecycle(state, event).state;
  }

  return state;
}

class DocumentController {
  readonly #root: HTMLElement;
  readonly #guard: HTMLDivElement;
  readonly #status: HTMLParagraphElement;
  readonly #resetButton: HTMLButtonElement;
  readonly #bypassButton: HTMLButtonElement;
  readonly #ref: WorkflowRef;
  readonly #authorizationId: string;
  #state = createEnabledLifecycleState();
  #attemptAbort = new AbortController();
  #guardAbort = new AbortController();
  #countdownTimer: number | undefined;
  #workspace: HTMLElement | undefined;
  #workspaceAriaHidden: string | null = null;
  #workspaceWasInert = false;
  #active = true;
  #acceptingWorkflow = true;

  constructor(root: HTMLElement) {
    this.#root = root;
    this.#ref = {
      documentId: crypto.randomUUID(),
      generation: 1,
    };
    this.#authorizationId = crypto.randomUUID();
    this.#guard = document.createElement("div");
    this.#guard.id = "lbr-editor-guard";
    this.#guard.setAttribute("role", "dialog");
    this.#guard.setAttribute("aria-label", "Blind Attempt");
    this.#guard.setAttribute("aria-live", "polite");
    this.#guard.setAttribute("data-phase", "guarded-preflight");
    this.#guard.tabIndex = -1;

    const panel = document.createElement("section");
    panel.setAttribute("data-lbr-guard-panel", "");
    const heading = document.createElement("h2");
    appendText(heading, "Blind Attempt");
    this.#status = document.createElement("p");
    appendText(this.#status, "正在保护 Coding Workspace…");
    const actions = document.createElement("div");
    actions.setAttribute("data-lbr-guard-actions", "");
    this.#resetButton = document.createElement("button");
    this.#resetButton.type = "button";
    this.#resetButton.setAttribute("aria-label", "立即盲重置");
    this.#resetButton.disabled = true;
    appendText(this.#resetButton, "立即盲重置");
    this.#bypassButton = document.createElement("button");
    this.#bypassButton.type = "button";
    this.#bypassButton.setAttribute("aria-label", "保留当前草稿");
    this.#bypassButton.disabled = true;
    appendText(this.#bypassButton, "保留当前草稿");
    actions.append(this.#resetButton, this.#bypassButton);
    panel.append(heading, this.#status, actions);
    this.#guard.append(panel);
    this.#root.append(this.#guard);
    this.#root.setAttribute(CONTROLLER_MARKER, "active");
    this.#root.removeAttribute(NEUTRALIZED_MARKER);
    this.#root.setAttribute(GUARD_MOUNTED_MARKER, "");
    window.addEventListener("keydown", this.#handleKeydown, {
      capture: true,
      signal: this.#guardAbort.signal,
    });
    document.addEventListener("focusin", this.#handleFocus, {
      capture: true,
      signal: this.#guardAbort.signal,
    });
  }

  start(): void {
    chrome.runtime.onMessage.addListener(this.#handleRuntimeMessage);

    void chrome.runtime
      .sendMessage({ type: "get-blind-mode-status" })
      .then((response: unknown) => {
        const blindMode =
          typeof response === "object" &&
          response !== null &&
          "blindMode" in response
            ? response.blindMode
            : undefined;
        const foregroundEligible =
          typeof response === "object" &&
          response !== null &&
          "foregroundEligible" in response &&
          response.foregroundEligible === true;
        this.#root.setAttribute(
          FOREGROUND_ELIGIBLE_MARKER,
          String(foregroundEligible),
        );

        if (blindMode !== "on" && blindMode !== "enabling") {
          this.deactivate();
          return;
        }

        if (!foregroundEligible) {
          this.#acceptingWorkflow = false;
          appendText(
            this.#status,
            "此 Practice View 不在前台；Blind Attempt 尚未开始。",
          );
          return;
        }

        this.#apply({
          type: "guarded-document-ready",
          authorizationId: this.#authorizationId,
          foreground: foregroundEligible,
          occurredAtMs: performance.now(),
          ref: this.#ref,
          routeKind: "practice",
        });
      })
      .catch(() => {
        this.#acceptingWorkflow = false;
        appendText(
          this.#status,
          "无法确认 Blind Mode；Editor Guard 将继续保护页面。",
        );
      });
  }

  isActive(): boolean {
    return this.#active;
  }

  deactivate(): void {
    if (!this.#active) {
      return;
    }

    this.#active = false;
    this.#acceptingWorkflow = false;
    this.#cancelAttempt();
    this.#guardAbort.abort();
    chrome.runtime.onMessage.removeListener(this.#handleRuntimeMessage);
    this.#restoreWorkspace();
    this.#guard.remove();
    this.#root.removeAttribute(GUARD_MOUNTED_MARKER);
    this.#root.setAttribute(CONTROLLER_MARKER, "inactive");
    this.#root.setAttribute(NEUTRALIZED_MARKER, "");
  }

  #isMessage(value: unknown, type: string): boolean {
    return (
      typeof value === "object" &&
      value !== null &&
      "type" in value &&
      value.type === type
    );
  }

  #handleRuntimeMessage = (
    message: unknown,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void,
  ): void => {
    if (this.#isMessage(message, "guarded-runtime-ready-probe")) {
      if (this.#active && this.#guard.isConnected) {
        sendResponse({ ready: true });
      }
      return;
    }

    if (this.#isMessage(message, "prevent-new-work")) {
      this.#preventNewWork();
      return;
    }

    if (this.#isMessage(message, "neutralize-guarded-runtime")) {
      this.deactivate();
    }
  };

  #preventNewWork(): void {
    if (!this.#active || !this.#acceptingWorkflow) {
      return;
    }

    this.#acceptingWorkflow = false;
    this.#cancelAttempt();
    this.#guard.setAttribute("data-phase", "disabling");
    appendText(this.#status, "Blind Mode 正在关闭；自动流程已停止。");
    this.#resetButton.disabled = true;
    this.#bypassButton.disabled = true;
  }

  #apply(event: LifecycleEvent): void {
    if (!this.#active || !this.#acceptingWorkflow) {
      return;
    }

    const transition = transitionLifecycle(this.#state, event);
    this.#state = transition.state;

    for (const command of transition.commands) {
      this.#execute(command);
    }
  }

  #execute(command: LifecycleCommand): void {
    switch (command.type) {
      case "inspect-coding-workspace":
        this.#inspectWorkspaceWhenReady(command.ref);
        return;
      case "establish-workspace-guard":
        this.#establishWorkspaceGuard(command.ref);
        return;
      case "schedule-countdown":
        this.#startCountdown(command.ref, command.deadlineAtMs);
        return;
      case "show-guarded-failure":
        this.#showGuardedFailure(command.reason);
        return;
      case "reset-sequence-intent":
        this.#rejectResetSequence(command.ref, command.authorizationId);
        return;
      case "cancel-generation":
        this.#cancelAttempt();
        return;
      case "remove-editor-guard":
        this.#completeBypass();
        return;
      case "persist-mode":
      case "install-guarded-runtime":
      case "rollback-guarded-runtime":
      case "disable-guarded-runtime":
        return;
    }
  }

  #inspectWorkspaceWhenReady(ref: WorkflowRef): void {
    const inspect = () => {
      if (!this.#isCurrent(ref)) {
        return;
      }

      const candidates = document.querySelectorAll(WORKSPACE_SELECTOR);
      this.#apply({
        type: "workspace-inspection-completed",
        candidateCount: candidates.length,
        occurredAtMs: performance.now(),
        ref,
      });
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", inspect, {
        once: true,
        signal: this.#attemptAbort.signal,
      });
    } else {
      queueMicrotask(inspect);
    }
  }

  #establishWorkspaceGuard(ref: WorkflowRef): void {
    if (!this.#isCurrent(ref)) {
      return;
    }

    const candidates = document.querySelectorAll(WORKSPACE_SELECTOR);

    if (candidates.length !== 1 || !(candidates[0] instanceof HTMLElement)) {
      this.#apply({
        type: "workspace-inspection-completed",
        candidateCount: candidates.length,
        occurredAtMs: performance.now(),
        ref,
      });
      return;
    }

    this.#workspace = candidates[0];
    this.#workspaceWasInert = this.#workspace.inert;
    this.#workspaceAriaHidden = this.#workspace.getAttribute("aria-hidden");
    this.#workspace.inert = true;
    this.#workspace.setAttribute("aria-hidden", "true");
    this.#positionGuardOverWorkspace();
    window.addEventListener("resize", this.#positionGuardOverWorkspace, {
      signal: this.#guardAbort.signal,
    });
    window.addEventListener("scroll", this.#positionGuardOverWorkspace, {
      capture: true,
      signal: this.#guardAbort.signal,
    });
    this.#apply({
      type: "workspace-guard-established",
      occurredAtMs: performance.now(),
      ref,
    });
  }

  #positionGuardOverWorkspace = (): void => {
    if (!this.#workspace || !this.#active) {
      return;
    }

    const bounds = this.#workspace.getBoundingClientRect();
    this.#guard.style.inset = "auto";
    this.#guard.style.left = `${bounds.left}px`;
    this.#guard.style.top = `${bounds.top}px`;
    this.#guard.style.width = `${bounds.width}px`;
    this.#guard.style.height = `${bounds.height}px`;
  };

  #startCountdown(ref: WorkflowRef, deadlineAtMs: number): void {
    if (!this.#isCurrent(ref)) {
      return;
    }

    this.#guard.setAttribute("data-phase", "countdown");
    appendText(this.#status, "五秒后准备盲重置；你可以保留当前草稿。");
    this.#resetButton.disabled = false;
    this.#bypassButton.disabled = false;
    this.#bypassButton.focus({ preventScroll: true });
    this.#resetButton.addEventListener(
      "click",
      () => this.#requestReset("button"),
      { signal: this.#attemptAbort.signal },
    );
    this.#bypassButton.addEventListener("click", () => this.#bypass("button"), {
      signal: this.#attemptAbort.signal,
    });
    this.#scheduleCountdown(ref, deadlineAtMs);
  }

  #scheduleCountdown(ref: WorkflowRef, deadlineAtMs: number): void {
    const remainingMs = Math.max(0, deadlineAtMs - performance.now());
    this.#countdownTimer = window.setTimeout(() => {
      if (!this.#isCurrent(ref)) {
        return;
      }

      const occurredAtMs = performance.now();
      this.#apply({
        type: "countdown-fired",
        occurredAtMs,
        ref,
        scheduledForMs: deadlineAtMs,
      });

      if (
        this.#state.attempt.phase === "countdown" &&
        occurredAtMs < deadlineAtMs
      ) {
        this.#scheduleCountdown(ref, deadlineAtMs);
      }
    }, remainingMs);
  }

  #handleKeydown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (
        this.#acceptingWorkflow &&
        this.#state.attempt.phase === "countdown"
      ) {
        this.#bypass("escape");
      } else {
        void chrome.runtime
          .sendMessage({ type: "set-blind-mode", enabled: false })
          .catch(() => undefined);
      }
      return;
    }

    if (
      event.key === "Enter" &&
      this.#acceptingWorkflow &&
      this.#state.attempt.phase === "countdown"
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.#requestReset("enter");
      return;
    }

    if (this.#eventTargetsProtectedArea(event.target)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };

  #handleFocus = (event: FocusEvent): void => {
    if (
      !this.#active ||
      !this.#guard.isConnected ||
      this.#guard.contains(event.target as Node | null) ||
      !this.#eventTargetsProtectedArea(event.target)
    ) {
      return;
    }

    event.stopImmediatePropagation();
    this.#focusGuard();
  };

  #eventTargetsProtectedArea(target: EventTarget | null): boolean {
    if (!this.#workspace) {
      return true;
    }

    return (
      target instanceof Node &&
      (this.#workspace.contains(target) || this.#guard.contains(target))
    );
  }

  #focusGuard(): void {
    if (
      this.#state.attempt.phase === "countdown" &&
      !this.#bypassButton.disabled
    ) {
      this.#bypassButton.focus({ preventScroll: true });
      return;
    }

    this.#guard.focus({ preventScroll: true });
  }

  #requestReset(source: "button" | "enter"): void {
    this.#apply({ type: "reset-requested", ref: this.#ref, source });
  }

  #bypass(source: "button" | "escape"): void {
    this.#apply({ type: "bypass-requested", ref: this.#ref, source });
  }

  #showGuardedFailure(
    reason:
      | "coding-workspace-missing"
      | "coding-workspace-ambiguous"
      | "reset-sequence-unavailable",
  ): void {
    this.#acceptingWorkflow = false;
    this.#cancelAttempt();
    this.#guard.setAttribute("data-phase", "guarded-failure");
    appendText(
      this.#status,
      reason === "reset-sequence-unavailable"
        ? "自动 Reset 尚未启用；Extension 未操作 LeetCode Reset。"
        : "无法唯一识别 Coding Workspace；Editor Guard 将继续保护页面。",
    );
    this.#resetButton.disabled = true;
    this.#bypassButton.disabled = true;
    this.#focusGuard();
  }

  #rejectResetSequence(ref: WorkflowRef, authorizationId: string): void {
    if (this.#countdownTimer !== undefined) {
      window.clearTimeout(this.#countdownTimer);
      this.#countdownTimer = undefined;
    }
    this.#apply({
      type: "reset-sequence-unavailable",
      authorizationId,
      ref,
    });
  }

  #cancelAttempt(): void {
    if (this.#countdownTimer !== undefined) {
      window.clearTimeout(this.#countdownTimer);
      this.#countdownTimer = undefined;
    }
    this.#attemptAbort.abort();
  }

  #completeBypass(): void {
    this.#acceptingWorkflow = false;
    this.#guardAbort.abort();
    this.#restoreWorkspace();
    this.#guard.remove();
    this.#root.removeAttribute(GUARD_MOUNTED_MARKER);
    this.#root.setAttribute(NEUTRALIZED_MARKER, "");
  }

  #restoreWorkspace(): void {
    if (!this.#workspace) {
      return;
    }

    this.#workspace.inert = this.#workspaceWasInert;
    if (this.#workspaceAriaHidden === null) {
      this.#workspace.removeAttribute("aria-hidden");
    } else {
      this.#workspace.setAttribute("aria-hidden", this.#workspaceAriaHidden);
    }
    this.#workspace = undefined;
  }

  #isCurrent(ref: WorkflowRef): boolean {
    return (
      this.#active &&
      this.#acceptingWorkflow &&
      !this.#attemptAbort.signal.aborted &&
      ref.documentId === this.#ref.documentId &&
      ref.generation === this.#ref.generation
    );
  }
}

const controllerGlobal = globalThis as ControllerGlobal;

if (!controllerGlobal.lbrDocumentControllerV1?.isActive()) {
  const controller = new DocumentController(document.documentElement);
  controllerGlobal.lbrDocumentControllerV1 = controller;
  controller.start();
}
