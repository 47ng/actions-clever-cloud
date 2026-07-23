# Clever Cloud E2E operations

## Protected environment

Create a protected GitHub Environment named `clever-cloud-e2e`.
Require reviewer approval before the job starts.

Add these environment secrets:

- `CLEVER_TOKEN`
- `CLEVER_SECRET`

Add this environment variable if you need a region other than the default:

- `CLEVER_E2E_REGION` (defaults to `par` when unset)

The workflow creates apps in the authenticated user's personal account.
It does not pass an organisation owner.

## Manual dispatch

Run `.github/workflows/e2e-manual.yml` from the branch whose current head matches the pull request head.
Pass the full 40-character internal pull request head SHA as `head_sha`.
The workflow rejects closed pull requests, fork pull requests, stale SHAs, and branch selections whose workflow run SHA does not match the input SHA.
After approval, it checks the pull request head again before app creation.

## Candidate setup

The reusable job checks out the candidate source with persisted credentials disabled.
It installs dependencies with `pnpm install --frozen-lockfile --ignore-scripts`.
Host control uses the candidate's locked Clever Tools binary at `node_modules/.bin/clever`.
No step calls `clever login`.

## App naming

Each run creates one app named `actions-clever-cloud-e2e-<run-id>-<attempt>`.
The workflow reports success only after it captures a valid `app_...` ID from Clever Cloud.

## Teardown and manual cleanup

Teardown always targets the captured app ID.
It cancels any active deployment for that app, deletes the app by exact ID, and checks that the app no longer appears in Clever Cloud.
If cleanup fails, the workflow reports the exact app name and ID so you can remove it by hand.

For manual cleanup, use the reported ID with Clever Tools from a trusted shell:

```bash
clever cancel-deploy --app <app-id>
clever delete --app <app-id> --yes
```
