function createWorkspaceMarkup(index: number): string {
  const suffix = index === 0 ? "" : `-${index}`;

  return String.raw`<section id="coding-workspace${suffix}" role="region" aria-label="Coding workspace">
        <label for="language-selector${suffix}">Programming language</label>
        <select id="language-selector${suffix}" aria-label="Programming language">
          <option value="typescript">TypeScript</option>
        </select>
        <div id="old-code-canary${suffix}" role="textbox" aria-label="Code editor" tabindex="0">OLD_CODE_CANARY</div>
        <section id="testcase-canary${suffix}" aria-label="Testcase">TESTCASE_CANARY</section>
        <section id="result-canary${suffix}" aria-label="Result">RESULT_CANARY</section>
        <section id="console-canary${suffix}" aria-label="Console">CONSOLE_CANARY</section>
        <button id="run-control${suffix}" type="button">Run</button>
        <button id="submit-control${suffix}" type="button">Submit</button>
        <button id="reset-entry${suffix}" type="button">Reset</button>
        <button id="reset-confirm${suffix}" type="button">Confirm reset</button>
      </section>`;
}

export function createLeetCodeFixtureHtml(workspaceCount = 1): string {
  const workspaces = Array.from({ length: workspaceCount }, (_, index) =>
    createWorkspaceMarkup(index),
  ).join("");

  return String.raw`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>LeetCode contract fixture</title>
    <style>
      body { margin: 0; }
      #fixture-root { display: grid; grid-template-columns: 40% 60%; min-height: 100vh; }
      #problem-description { min-height: 130vh; overflow: auto; padding: 24px; }
      [aria-label="Coding workspace"] { align-content: start; display: grid; gap: 8px; padding: 24px; }
      [aria-label="Code editor"] { background: magenta; min-height: 160px; }
    </style>
  </head>
  <body>
    <main id="fixture-root">
      <article id="problem-description" tabindex="0">Problem description</article>
      ${workspaces}
    </main>
    <script>
      globalThis.fixtureEvents = [];
      window.addEventListener("keydown", (event) => {
        globalThis.fixtureEvents.push("page-keydown:" + event.key);
      });
      document.querySelector("#reset-entry")?.addEventListener("click", () => {
        globalThis.fixtureEvents.push("reset-entry-clicked");
      });
      document.querySelector("#reset-confirm")?.addEventListener("click", () => {
        globalThis.fixtureEvents.push("reset-confirm-clicked");
      });
    </script>
  </body>
</html>`;
}

export const LEETCODE_FIXTURE_HTML = createLeetCodeFixtureHtml();
