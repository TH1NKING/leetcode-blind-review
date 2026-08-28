export const LEETCODE_FIXTURE_HTML = String.raw`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>LeetCode contract fixture</title>
  </head>
  <body>
    <main id="fixture-root">
      <article id="problem-description">Problem description</article>
      <section id="coding-workspace">
        <label for="language-selector">Language</label>
        <select id="language-selector">
          <option value="typescript">TypeScript</option>
        </select>
        <pre id="old-code-canary">OLD_CODE_CANARY</pre>
        <button id="reset-entry" type="button">Reset</button>
        <button id="reset-confirm" type="button">Confirm reset</button>
      </section>
    </main>
    <script>
      globalThis.fixtureEvents = [];
      document.querySelector("#reset-entry").addEventListener("click", () => {
        globalThis.fixtureEvents.push("reset-entry-clicked");
      });
      document.querySelector("#reset-confirm").addEventListener("click", () => {
        globalThis.fixtureEvents.push("reset-confirm-clicked");
      });
    </script>
  </body>
</html>`;
