# AGENTS.md

A static single-page site, served from GitHub Pages, that reads two Wisdom Panel (MyDogDNA) PDF genetic reports and predicts the coat colours of the two dogs' puppies, with per-puppy probabilities. The reports are parsed in the browser and are never uploaded.

## Commands

`./run` is the only entry point; there is no Makefile and there are no npm scripts. `./run` with no arguments prints the help.

| Command | What it does |
|---|---|
| `./run setup` | Install dependencies from the lockfile (`npm ci`) |
| `./run dev` | Start the Vite dev server |
| `./run preview` | Serve the production build from `dist/` (run after `build`) |
| `./run typecheck` | Type-check every TypeScript file |
| `./run fixtures [dir]` | Rewrite `tests/fixtures/sample-*.json` from the local sample reports in `_local/samples` (see *Sample reports and fixtures*) |
| `./run test` | Run the Vitest suite, including the local-only tests against the sample reports when they are present |
| `./run build` | Build the production site into `dist/` |
| `./run check-csp` | Check that `dist/index.html` carries the expected Content-Security-Policy meta tag (run after `build`) |
| `./run check-pdfs [base]` | Fail if a tracked file is named `*.pdf` (any case) or starts with the PDF signature `%PDF-`; given a base ref, also fail if any commit in `base..HEAD` added a `*.pdf` path or added or changed a file to start with `%PDF-`, even one deleted later. A failing git command fails the check |

CI runs every command except `dev`, `preview` and `fixtures` on every pull request, with `check-pdfs` given the pull request's base branch. The Pages deploy calls the same CI workflow on every push to `main` and on manual runs, and deploys only if it passes; there `check-pdfs` scans the tree only, since a PDF already in `main`'s history is public. A new check target runs in CI only after it is added as a step in `.github/workflows/ci.yml`. A new `./run` target is `function name {`, then a `#@ Description` line, then a `#@ Category: X` line, in that order; the help is generated from them.

## Conventions

- TypeScript in strict mode, with no `any`.
- Vite builds the site and Vitest runs the tests; tests live under `tests/` as `*.test.ts`. No UI framework.
- Conventional commits: `<type>(<scope>): <subject>`, at most 50 characters, imperative mood.
- Text derived from a PDF is untrusted. Insert it with `textContent` or text nodes only, never `innerHTML`, `insertAdjacentHTML` or HTML template strings.
- The production build carries a Content-Security-Policy meta tag, added by a build-only plugin in `vite.config.ts`. `scripts/csp-check.ts` states the same policy independently; change both together.
- The page makes no third-party requests: no CDNs, no hosted fonts, no analytics.
- Raw reports live only in the git-ignored `_local/` directory and are never committed. `*.pdf` is ignored, and CI fails if a PDF is tracked or a pull request's commits ever added one, even if a later commit deleted it. A PDF pushed to any branch or pull request is public: rewriting the branch only keeps it out of `main` and clears CI, and the pushed commit stays reachable on GitHub until GitHub Support purges it, so tell the owner immediately.

## Sample reports and fixtures

The report reader (`src/report/`) is tested on fixtures: committed line streams of real reports, cut down to the header block, the colour and Short Tail rows and a few chosen health rows, with every identifier replaced by a placeholder ("Sample A", "000000000000000", "KIT000A"). `./run fixtures` writes them from the real PDFs in `_local/samples/`. It collects each report's identifier values (header fields, the words of names and of the file name, IDs in the PDF metadata) and refuses to write a fixture that still contains any of them, naming only the kind of identifier. Samples D and E are other owners' dogs, so their fixtures hold no health rows.

`_local/samples/manifest.json` says which PDF is which sample; it names the dogs, so it stays local:

```json
{
  "fixtures": { "a": "<dir>/<file>.pdf", "b": "…", "c": "…", "d": "…", "e": "…" },
  "rejections": { "<dir>/<file>.pdf": "adobe-pdf-printer" }
}
```

Paths are relative to `_local/samples`; each rejection value is a `RejectionKind` from `src/report/types.ts`. When the manifest is present, `./run test` also runs `tests/report/real-pdfs.local.test.ts`, which reads every listed PDF through pdf.js and compares it with its fixture or expected rejection, and the local part of `tests/report/fixtures-privacy.test.ts`, which checks the committed fixtures against the real identifier values. Without it, as in CI, those tests are skipped.

pdf.js is the legacy build everywhere: Node needs it, and it polyfills built-ins that the modern build assumes but older phone browsers lack. In the browser `src/report/browser.ts` points it at its bundled worker.

## Rendering the UI

Run `./run setup` once, then `./run dev` and open <http://localhost:5173/dog-colors/>. The dev server serves without the Content-Security-Policy, because Vite injects inline scripts during development. To see the page as deployed, with the policy in force, run `./run build` and then `./run preview`, and open <http://localhost:4173/dog-colors/>.

Fixture-driven states, selected through a dev-only query parameter so that each screen can be rendered without real reports, arrive with the UI units.
