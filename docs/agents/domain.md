# Domain Docs

This repository uses a single domain context.

## Before exploring or changing the project

- Read the root `CONTEXT.md` and use its canonical vocabulary.
- Read the relevant decisions under `docs/adr/`.
- Read the accepted design and test documents relevant to the requested work.
- If a referenced document does not exist, proceed without inventing one.

## Vocabulary

Use the terms defined in `CONTEXT.md` in issues, specifications, implementation plans, code, tests, diagnostics, and user-facing text. Avoid synonyms explicitly listed under `_Avoid_`.

If implementation work reveals a genuine missing domain concept, update the glossary through the domain-modeling workflow rather than introducing competing terminology in code.

## Architectural decisions

Treat relevant ADRs as constraints. If proposed work conflicts with an ADR, surface the conflict explicitly and revisit the decision instead of silently overriding it.

## Layout

```text
/
├── CONTEXT.md
├── docs/
│   ├── adr/
│   ├── design/
│   └── testing/
└── src/
```
