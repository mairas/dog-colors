# AGENTS.md

A static single-page site, served from GitHub Pages, that reads two Wisdom Panel (MyDogDNA) PDF genetic reports and predicts the coat colours of the two dogs' puppies, with per-puppy probabilities. The reports are parsed in the browser and are never uploaded.

## Commands

`./run` is the only entry point; there is no Makefile and there are no npm scripts. `./run` with no arguments prints the help.

| Command | What it does |
|---|---|
| `./run setup` | Install dependencies from the lockfile (`npm ci`) |
| `./run dev` | Start the Vite dev server |
| `./run preview` | Serve the production build from `dist/` (run after `build`) |
| `./run preview-fixtures` | Build with the dev-only fixture states into `dist-fixtures/` and serve it with the Content-Security-Policy in force |
| `./run typecheck` | Type-check every TypeScript file |
| `./run fixtures [dir]` | Rewrite `tests/fixtures/sample-*.json` from the local sample reports in `_local/samples` (see *Sample reports and fixtures*) |
| `./run conditions [dir]` | Rewrite `src/health/conditions.json`, the inheritance catalogue, from the local current-format sample reports |
| `./run record-readings` | Record the local sample reports' full readings for the current reader and pdfjs-dist versions in `_local/samples/readings/` (see *Sample reports and fixtures*) |
| `./run test` | Run the Vitest suite, including the local-only tests against the sample reports when they are present |
| `./run build` | Build the production site into `dist/` |
| `./run check-csp` | Check that `dist/index.html` carries the expected Content-Security-Policy meta tag (run after `build`) |
| `./run check-fixtures` | Check that `dist/` carries none of the dev-only fixture states: their entry point, state names and the fixtures' placeholder names and IDs (run after `build`) |
| `./run check-pdfs [base]` | Fail if a tracked file is named `*.pdf` (any case) or starts with the PDF signature `%PDF-`; given a base ref, also fail if any commit in `base..HEAD` added a `*.pdf` path or added or changed a file to start with `%PDF-`, even one deleted later. A failing git command fails the check |

CI runs every command except `dev`, `preview`, `preview-fixtures`, `fixtures`, `conditions` and `record-readings` on every pull request, with `check-pdfs` given the pull request's base branch. The Pages deploy calls the same CI workflow on every push to `main` and on manual runs, and deploys only if it passes; there `check-pdfs` scans the tree only, since a PDF already in `main`'s history is public. A new check target runs in CI only after it is added as a step in `.github/workflows/ci.yml`. A new `./run` target is `function name {`, then a `#@ Description` line, then a `#@ Category: X` line, in that order; the help is generated from them.

## Conventions

- TypeScript in strict mode, with no `any`.
- Vite builds the site and Vitest runs the tests; tests live under `tests/` as `*.test.ts`. A test whose wall-clock budget is close to its measured time is a `*.perf.test.ts`: the `perf` project in `vite.config.ts` runs those after the rest, one file at a time, so no other test file loads the machine. No UI framework.
- Conventional commits: `<type>(<scope>): <subject>`, at most 50 characters, imperative mood.
- Text derived from a PDF is untrusted. Insert it with `textContent` or text nodes only, never `innerHTML`, `insertAdjacentHTML` or HTML template strings.
- The production build carries a Content-Security-Policy meta tag, added by a build-only plugin in `vite.config.ts`. `scripts/csp-check.ts` states the same policy independently; change both together.
- GoatCounter counts page views: `index.html` loads its versioned count.js, pinned by an SRI hash, and count.js sends one page view to `https://mairas.goatcounter.com/count`. count.js skips localhost, so local runs count nothing. Any script, font or request from another origin needs its own Content-Security-Policy entry, and `tests/index-html.test.ts` lists the external scripts and requires each to be pinned by an SRI hash with `crossorigin="anonymous"`.
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

`READER_VERSION` in `src/report/version.ts` names the reader that parsed a report. `tests/report/version.test.ts` keeps a file snapshot of it, the installed pdfjs-dist version and every committed fixture's parsed report, so any change to them fails. Locally, the real-PDF test also compares each sample's full report with the copy recorded by `./run record-readings` in `_local/samples/readings/<reader>-<pdfjs-dist>.json`; a missing copy fails, and a difference names the fields but not their values. Bump `READER_VERSION` when the parsed fixtures changed in a way saved reports would share, or when that local comparison changed; then re-record the snapshot with `./run test -u` and the local copy with `./run record-readings`. A pdfjs-dist update that changes neither re-records the snapshot with no bump, and is merged only after the owner has run the local tests.

The older format prints no Inheritance column, so the health analysis takes modes from `src/health/conditions.json`: condition name, gene, risk variant and mode for every condition on the current-format panel, and nothing about any dog. `./run conditions` rebuilds it from the current-format samples and, like the fixture script, refuses to write it if it holds any sample's identifying values. With the manifest present, `tests/health/real-reports.local.test.ts` fails when the committed catalogue differs from what the samples give. An older-format condition whose name or variant the matching rules cannot pair with the current format's is aliased to its current-format key in `src/health/aliases.ts`, by exact key only.

pdf.js is the legacy build everywhere: Node needs it, and it polyfills built-ins that the modern build assumes but older phone browsers lack. In the browser `src/report/browser.ts` points it at its bundled worker.

## Rendering the UI

Run `./run setup` once, then `./run dev` and open <http://localhost:5173/dog-colors/>. The dev server serves without the Content-Security-Policy, because Vite injects inline scripts during development. To see the page as deployed, with the policy in force, run `./run build` and then `./run preview`, and open <http://localhost:4173/dog-colors/>.

The breeding note's close cross hides it for 30 days by storing the expiry, in epoch milliseconds, under the localStorage key `dog-colors:breeding-note-hidden-until`; on the plain page, remove that key to see the note again. The fixture states below keep it in memory instead, so a dismissal lasts until the next load and never reaches localStorage; add `&note=hidden` to start one with the note dismissed.

Every state of the page can be rendered without real reports through a dev-only query parameter, handled by `src/ui/dev.ts` from the committed fixtures and synthetic reports built from them. The module is loaded only when the build-time constant `__FIXTURES__` is true: in the dev server and in `./run preview-fixtures`, never in `./run build`, so the production bundle carries none of it; `./run check-fixtures` checks this, in CI and before every Pages deploy. Use `./run preview-fixtures` (<http://localhost:4173/dog-colors/>) to see a state with the policy in force, or `./run dev` (port 5173).

`?state=<name>` gives one of the approved mockup's states:

| State | URL |
|---|---|
| Both slots empty | `?state=slot-empty` |
| Note dismissed, start | `?state=slot-empty&note=hidden` |
| One card, results hidden | `?state=results-hidden` |
| Reading a report | `?state=slot-reading` |
| Rejected file in an empty slot | `?state=slot-error` |
| Both cards loaded | `?state=slot-loaded` |
| Open nose question (bd 1 + bc 1) | `?state=slot-questions` |
| Ambiguity no question settles (ASIP) | `?state=slot-unanswerable` |
| Rejected replacement, kept card | `?state=slot-replace-error` |
| Page-level drop message | `?state=page-drop-error` |
| Locus missing from a report | `?state=slot-missing` |
| Same report in both slots | `?state=pair-duplicate` |
| Results | `?state=results-populated` |
| Note dismissed, results | `?state=results-populated&note=hidden` |
| Results with ranges | `?state=results-ranges` |
| Results with warnings | `?state=results-warnings` |
| Results with an unknown locus | `?state=results-partial` |
| Same-sex pair (two males) | `?fixtures=a,c` |
| Health odds unknown: same-sex parents, unknown inheritance | `?state=results-health-unknown` |

`?fixtures=<first>,<second>` loads any two reports, unanswered: the samples `a` to `e`, or the synthetic `q` (nose question), `x` (ASIP ambiguity), `m` (TYRP1 missing), `w` and `v` (merle and dilute carriers with a bobtail, both carrying a recessive condition, with an X-linked condition and one tested in Parent 1 only), `h` and `k` (two females sharing an X-linked, a mitochondrial and an unknown-inheritance condition; `k` is clear of the mitochondrial one), and `u` and `n` (the same health as `h` and `k`, with the sex unread). Their names are placeholders such as "Sample Q". These health pairings have no state of their own:

| Health state | URL |
|---|---|
| One sex unread: the pairing assumed female × male | `?fixtures=h,n` |
| Neither sex read: unknown X-linked odds, the daughters warning as a range | `?fixtures=u,n` |
| Neither sex read, equal copies: the daughters warning as one figure | `?fixtures=u,u` |
| Mitochondrial row kept at 0%: dam clear, sire at risk | `?fixtures=k,u` |
