# LeetCode Blind Review

This context describes a personal workflow for solving a LeetCode problem again from its default code template without seeing previously saved code.

## Language

**Blind Attempt**:
A single guarded lifecycle intended to let the user solve one problem in one programming language from a freshly restored default code template without seeing code saved before the lifecycle began. It ends when the tab leaves that Problem Identity, changes language, or performs a Blind Restart, and history navigation cannot revive it.
_Avoid_: Problem Visit, Session, page visit

**Blind Restart**:
The user's intent to discard the current editor draft and begin a new Blind Attempt for the same problem.
_Avoid_: Refresh, Reset

**Problem Identity**:
The stable identity of one LeetCode problem. Different views such as Description, Solutions, and Submissions share the same Problem Identity.
_Avoid_: Problem page, problem route, subroute

**Guarded Failure**:
A terminal state in which automatic reset activity has stopped while the editor remains protected. The user can explicitly retry or reveal the editor's current state, which may contain earlier code or may already have been reset.
_Avoid_: Timeout, stuck, fail-open

**Reset Confirmation**:
Evidence that LeetCode's own reset interaction reached its expected completed state. It confirms the UI workflow, not equality between the editor contents and a separately verified template.
_Avoid_: Template verification, content verification, reset click

**Reset Commit Point**:
The moment the extension activates LeetCode's final destructive confirmation for a reset. Cancellation before this point guarantees that the extension has not overwritten the draft; cancellation after it cannot undo the reset.
_Avoid_: Reset start, menu click, reset request

**Reset Authorization**:
A one-use permission to execute one complete automatic reset interaction. A Blind Attempt receives one automatically; each retry requires a new explicit authorization from the user.
_Avoid_: Retry count, reset flag, observer trigger

**Attempt Bypass**:
The user's pre-commit choice to keep the current editor draft and reveal it for this entry without disabling Blind Mode. The next qualifying restart trigger is unaffected.
_Avoid_: Skip, disable once, cancel failure

**Bypassed Entry**:
The terminal state produced by an Attempt Bypass. No observer or delayed callback may reset this entry, and its Attempt Ownership remains held until the entry ends, Blind Mode is disabled, or ownership is transferred.
_Avoid_: Blind Attempt, failed attempt, temporary pause

**Adopted Entry**:
A Practice View that was already open when Blind Mode became enabled and is kept without an automatic reset. It is brought under Attempt Ownership and remains terminal until a qualifying Blind Restart or entry-ending event.
_Avoid_: Bypassed entry, ignored tab, grandfathered tab

**Dormant Entry**:
A guarded Practice View that is not the foreground active tab. It holds no Attempt Ownership, runs no deadline or countdown, and cannot interact with Reset until the user brings it to the foreground.
_Avoid_: Background attempt, paused reset, waiting owner

**Recovery Entry**:
A Practice View restored automatically by Chrome, a discarded-tab reload, or extension recovery rather than by a deliberate Blind Restart. It remains guarded until the user explicitly chooses to restart blindly or keep the current editor state.
_Avoid_: Reload, new attempt, dormant entry

**Suspended Attempt**:
A pre-commit Blind Attempt that has lost foreground eligibility before any Reset interaction began. Its Guard and Attempt Ownership remain, but its countdown, deadline, and click authority are paused until it returns to the foreground.
_Avoid_: Dormant entry, background reset, stopped attempt

**Released Attempt**:
A Blind Attempt whose Reset Confirmation has completed and whose Editor Guard has been removed. The extension can never reset it again; only a new qualifying trigger can create another Blind Attempt.
_Avoid_: Ready editor, completed reset, user started typing

**Revealed Entry**:
The terminal state created when the user explicitly removes a Guard after an uncertain or post-commit failure. The visible editor may contain earlier code or may already have been reset; no automatic event may reset it again, and its Attempt Ownership remains held until the entry ends, Blind Mode is disabled, or ownership is transferred.
_Avoid_: Attempt Bypass, preserved draft, released attempt

**Content-Blind**:
The trust boundary under which the extension never accesses code, test cases, console output, run results, or submission content. Only non-content workflow metadata may be processed.
_Avoid_: No AI analysis, anonymous code, code hashing

**Editor Guard**:
The best-effort visual protection that prevents previously saved editor code from being shown on supported and tested interaction paths during a Blind Restart. It begins as a full-viewport shield and narrows to the Coding Workspace only after that workspace is identified.
_Avoid_: Editor hide, loading screen, reset overlay

**Coding Workspace**:
The complete LeetCode work surface containing language controls, editor text and minimap, test cases, execution results, console output, and run or submit controls. It is revealed as one unit.
_Avoid_: Code box, editor text, right panel

**Attempt Ownership**:
The exclusive right of one browser tab to run a Blind Attempt for a particular Problem Identity and programming language. A conflicting tab remains guarded unless the user explicitly takes ownership.
_Avoid_: Tab lock, active tab, session owner

**Ownership Transfer**:
The explicit reassignment of Attempt Ownership to another tab. The previous owner is guarded and paused without its in-memory code being cleared before the new owner may reset.
_Avoid_: Force reset, tab switch, ownership steal

**Practice Problem**:
A supported `leetcode.cn` problem reached through the standard `/problems/{slug}` page family. `leetcode.com`, Contest, assessment, Explore-embedded, Playground, and other special editor surfaces are outside this context.
_Avoid_: Any editor page, daily-use page, coding page

**Reference View**:
The Solutions or Submissions view of a Practice Problem, entered intentionally to inspect ideas or prior work. Entering it directly does not create a Blind Attempt and never causes an automatic reset.
_Avoid_: Practice entry, excluded page, unsafe route

**Practice View**:
The Description or standard solving view of a Practice Problem where a Blind Attempt may begin. Moving into it starts an attempt only when the current tab has no continuing same-problem, same-language Released Attempt or Bypassed Entry.
_Avoid_: Problem page, any subroute, editor route

**Blind Mode**:
The persistent, browser-wide setting that authorizes the extension to create Blind Attempts on Practice Problems. Disabling it cancels all workflows, ends all attempts, releases all ownership, and leaves the extension inert on those pages.
_Avoid_: Script enabled, extension running, active script
