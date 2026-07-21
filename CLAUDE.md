# actions-clever-cloud

GitHub Action deploying to Clever Cloud by driving the clever-tools CLI.
Docker action: users run a prebuilt image, NOT the code on master.

## Commands

- Install: `pnpm install --ignore-scripts` (`pnpm` version: `packageManager` in `package.json`; Node version: `.node-version`)
- Test + typecheck: `CI=true pnpm test` (`vitest --typecheck`; no separate `tsc`/lint script)
- Build: `pnpm build` (`tsdown` -> `dist/`, gitignored — never commit `dist`)
- Dead code: `pnpm knip`

## Auth

No `clever login` call. `CLEVER_TOKEN`/`CLEVER_SECRET` are read directly from
env by clever-tools (its virtual `$env` profile) — set them as job secrets.

## Release coupling (easy to get wrong)

- `action.yml` `runs.image` tag MUST equal `package.json` version (CI enforces).
- Bump both together. Referencing `@master` still runs the pinned Docker
  image from `action.yml`, not the checked-out source.

## CI security invariants (do not weaken)

- All workflows: top-level `permissions: {}`, jobs opt in minimally.
- Never interpolate attacker-controllable values (PR titles/bodies/branch
  names, fork data, workflow inputs) into `run:` scripts — pass via `env:`
  (see `pr-preview-manual.yml`). Trusted server-side values (`github.sha`,
  push-event `ref_name`, own-step outputs) may appear inline.
- Fork PRs never get secrets; manual preview workflow is the vetted-fork path.

## Conventions

- Conventional commits (fix:/feat:/chore:/docs:).
- Prettier config in package.json; no semicolons, single quotes.
