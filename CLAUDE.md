# actions-clever-cloud

GitHub Action deploying to Clever Cloud by driving the clever-tools CLI.
Docker action: users run a prebuilt image, NOT the code on master.

## Commands
- Install: pnpm install --ignore-scripts   (pnpm 11 via corepack, Node 24.9)
- Test + typecheck: CI=true pnpm test      (vitest --typecheck; no separate tsc/lint script)
- Build: pnpm build                        (tsdown -> dist/, gitignored — never commit dist)
- Dead code: pnpm knip

## Layout
- src/main.ts       entry: git safe.directory fix, arg parsing, run()
- src/arguments.ts  inputs from INPUT_* env + CLEVER_TOKEN/CLEVER_SECRET
- src/action.ts     run(): clever-tools calls; output tee (annotations, quiet, logFile)
- *.test.ts         co-located vitest; @actions/* mocked at module top

## Auth
No `clever login` call. CLEVER_TOKEN/CLEVER_SECRET are read directly from
env by clever-tools (its virtual "$env" profile) — set them as job secrets.

## Release coupling (easy to get wrong)
- action.yml runs.image tag MUST equal package.json version (CI enforces).
- Bump both together. `@master` does not run master code; Docker image does.

## CI security invariants (do not weaken)
- All workflows: top-level `permissions: {}`, jobs opt in minimally.
- Never interpolate `${{ }}` into run: scripts — pass via env: (see pr-preview-manual.yml).
- Fork PRs never get secrets; manual preview workflow is the vetted-fork path.

## Conventions
- Conventional commits (fix:/feat:/chore:/docs:).
- Prettier config in package.json; no semicolons, single quotes.
