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
| `./run test` | Run the Vitest suite |
| `./run build` | Build the production site into `dist/` |
| `./run check-csp` | Check that `dist/index.html` carries the expected Content-Security-Policy meta tag (run after `build`) |
| `./run check-pdfs` | Fail if any PDF file is tracked by git |

CI runs every command except `dev` and `preview` on every pull request; a new check target runs in CI only after it is added as a step in `.github/workflows/ci.yml`. A new `./run` target is `function name {`, then a `#@ Description` line, then a `#@ Category: X` line, in that order; the help is generated from them.

## Conventions

- TypeScript in strict mode, with no `any`.
- Vite builds the site and Vitest runs the tests; tests live under `tests/` as `*.test.ts`. No UI framework.
- Conventional commits: `<type>(<scope>): <subject>`, at most 50 characters, imperative mood.
- Text derived from a PDF is untrusted. Insert it with `textContent` or text nodes only, never `innerHTML`, `insertAdjacentHTML` or HTML template strings.
- The production build carries a Content-Security-Policy meta tag, added by a build-only plugin in `vite.config.ts`. `scripts/csp-check.ts` states the same policy independently; change both together.
- The page makes no third-party requests: no CDNs, no hosted fonts, no analytics.
- Raw reports live only in the git-ignored `_local/` directory and are never committed. `*.pdf` is ignored, and CI fails if a PDF is tracked.

## Rendering the UI

Run `./run setup` once, then `./run dev` and open <http://localhost:5173/dog-colors/>. The dev server serves without the Content-Security-Policy, because Vite injects inline scripts during development. To see the page as deployed, with the policy in force, run `./run build` and then `./run preview`, and open <http://localhost:4173/dog-colors/>.

Fixture-driven states, selected through a dev-only query parameter so that each screen can be rendered without real reports, arrive with the UI units.
