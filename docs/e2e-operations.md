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

After the first healthy deploy, the suite generates one random 16-byte base64 value,
checks that it keeps its `==` padding, sends it through `setEnv`, and compares the
public and remote values without printing it.
The same deployment runs with `quiet: true` and writes raw output to a log file so the
suite can check the fixture build and startup markers.

Each proceeded reusable run also writes a GitHub step summary.
That summary includes the caller, safe app identity, teardown outcome, failure-evidence status,
and one row per scenario with its outcome, commit, deployment, and candidate log path.

## App naming

Each run creates one app named `actions-clever-cloud-e2e-<run-id>-<attempt>`.
The workflow reports success only after it captures a valid `app_...` ID from Clever Cloud.

## Failure evidence

A failed reusable run prepares redacted failure evidence before teardown, then uploads one short-lived artifact named `clever-cloud-e2e-failure-<run-id>-<attempt>`.
Download that artifact from the workflow run page if you need to inspect a live failure after the app has been deleted.
It contains:

- `suite-results.json` with scenario outcomes, app identity, commit IDs, deployment IDs, and candidate action log paths
- `candidate-action/*.log` for any captured candidate action logs, including `001-deploy-healthy.log` through `012-timeout.log`

If evidence preparation fails its redaction scan, the workflow skips the upload and fails the run so you can inspect the job log instead.

## Teardown and manual cleanup

Teardown always targets the captured app ID.
It loops until no deployment is still active, waiting for each latest deployment to reach `WIP`, cancelling it, then deleting the app by exact ID and checking that the app no longer appears in Clever Cloud.
If cleanup fails, the workflow reports the exact app name and ID so you can remove it by hand.

For manual recovery, first download the failure evidence artifact if one exists.
If `clever cancel-deploy` reports that the latest deployment is not in `WIP`, wait for that deployment to reach `WIP` and retry.
Then use the reported app ID with Clever Tools from a trusted shell:

```bash
clever cancel-deploy --app <app-id>
clever delete --app <app-id> --yes
```
