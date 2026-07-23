---
# acc-9ddy
title: Build Clever Cloud end-to-end deployment suite
status: todo
type: epic
priority: high
created_at: 2026-07-23T11:00:31Z
updated_at: 2026-07-23T11:01:08Z
---

## Problem Statement

The action has strong local test coverage, but it has no automated test that runs the preview image inside GitHub Actions and deploys a real application to Clever Cloud. Local tests can confirm input parsing, command arguments, process handling, and log handling. They cannot prove that GitHub maps the action inputs correctly, that the bundled Clever Tools client can authenticate, that Git deployment works, or that Clever Cloud reports success and failure as the action expects.

A release can therefore pass all current checks while carrying a fault in its image, action metadata, Git handling, Clever Tools integration, remote deployment flow, or log output. The first full check happens when a user deploys an application.

The project needs a trusted, repeatable live test that uses the exact preview image built for a release candidate. The test must limit access to personal Clever Cloud credentials, avoid testing stale images, exercise the public action contract, preserve useful failure evidence, and delete each test application when the run ends.

## Solution

Add a reusable GitHub Actions workflow that creates a short-lived Node.js application in the maintainer's personal Clever Cloud account, runs an ordered set of deployments with the candidate preview action, checks remote state and HTTP responses, and deletes the application.

The automatic caller will run for a ready Release Please pull request after its exact `git-<head-sha>` preview image becomes available. A manual caller will let a maintainer test the current head SHA of any internal pull request. Both callers will verify the candidate, resolve its image tag to a digest, and invoke the same reusable suite.

The suite will use a small Node.js fixture whose behaviour comes from environment variables. It will support healthy starts, build failures, startup failures, delayed builds, known log markers, and a health response that exposes an allow-listed set of Clever Cloud values. The workflow will create controlled Git commits so it can test normal deployment, same-commit policies, non-fast-forward deployment, forced deployment, and timeout handling.

The workflow will use a protected GitHub Environment. It will expose Clever Cloud credentials only to the steps that need them. Runs for one pull request will be serialised without cancelling the running job, so teardown can finish. GitHub may replace an older pending run with the latest update before it starts. Runs for different pull requests may proceed at the same time.

## User Stories

1. As a release maintainer, I want a release candidate to deploy a real application, so that I can find faults before users receive the release.
2. As a release maintainer, I want the live suite to use the preview image for the exact pull request head SHA, so that the result applies to the candidate I may release.
3. As a release maintainer, I want the preview tag resolved to an image digest, so that the image cannot change during the test.
4. As a release maintainer, I want the image revision label checked against the pull request head SHA, so that an accidental tag or digest mismatch fails before credentials are supplied.
5. As a release maintainer, I want a ready Release Please pull request to start the live suite automatically, so that I do not need to remember a separate command.
6. As a release maintainer, I want later updates to a ready Release Please pull request tested as well, so that the final head receives live proof.
7. As a release maintainer, I want an unchanged ready event to reuse its existing verified preview image, so that the workflow avoids a needless rebuild.
8. As a release maintainer, I want the workflow to build the exact preview image when it is missing, so that a missing tag does not leave the release candidate untested.
9. As a release maintainer, I want a running preview for the same pull request kept alive while the latest update waits, so that teardown can finish safely.
10. As a release maintainer, I want a queued run to recheck the current pull request state before provisioning, so that it does not deploy a stale candidate.
11. As a release maintainer, I want a superseded automatic run to end as a clear skip, so that the newer queued run provides the useful result without a false failure.
12. As a maintainer, I want to launch the same live suite for an internal pull request by its full head SHA, so that I can test changes to the suite before a release.
13. As a maintainer, I want the manual workflow to reject stale SHAs, closed pull requests, and fork pull requests, so that personal credentials reach only a current internal candidate.
14. As a maintainer, I want a manual run that becomes stale while waiting for approval to fail before provisioning, so that I can dispatch the new head SHA.
15. As a maintainer, I want automatic and manual entry points to call one shared suite, so that their deployment checks cannot drift apart.
16. As a maintainer, I want pull requests from different branches to run live suites at the same time, so that unrelated work does not block each other.
17. As a maintainer, I want all live runs to require approval through a protected GitHub Environment, so that candidate code cannot receive my credentials without review.
18. As a maintainer, I want Clever Cloud credentials exposed only to the exact steps that need them, so that setup, Git, assertion, and reporting steps cannot read them.
19. As a maintainer, I want the suite to use `CLEVER_TOKEN` and `CLEVER_SECRET` without calling `clever login`, so that CI follows the action's supported authentication model.
20. As a maintainer, I want applications created in my personal Clever Cloud account, so that the suite does not depend on an organisation billing arrangement.
21. As a maintainer, I want the Clever Cloud region set through an environment variable with `par` as the default, so that I can change regions without editing the workflow.
22. As a maintainer, I want the host-side setup to use the candidate's locked Clever Tools version, so that dependency upgrades receive live coverage.
23. As a maintainer, I want dependency install scripts disabled during CI setup, so that installation does not run package lifecycle code with credentials.
24. As a maintainer, I want each suite run to create a new application with a unique run-based name, so that state from an earlier run cannot affect the result.
25. As a maintainer, I want the application ID captured as soon as creation succeeds, so that later steps have one exact resource identity.
26. As a maintainer, I want teardown to run after any later failure once creation has passed, so that failed scenarios do not normally leave applications behind.
27. As a maintainer, I want teardown to delete only the exact captured application ID, so that it cannot remove another application by a broad name match.
28. As a maintainer, I want deletion checked through Clever Cloud, so that cleanup failure makes the run fail instead of remaining hidden.
29. As a maintainer, I want a failed cleanup to print the application name and ID, so that I can remove it by hand.
30. As an action maintainer, I want the first deployment to pass only `appID` after the provisioning link is removed, so that the action proves it can create its own Clever link.
31. As an action maintainer, I want every later deployment to continue using `appID`, so that the main supported identifier path receives consistent coverage.
32. As an action maintainer, I want the candidate action metadata copied with only its image replaced by the verified digest, so that input names and defaults come from the release candidate.
33. As an action maintainer, I want GitHub to invoke the candidate through a normal `uses` step, so that Docker action input mapping, workspace mounts, exit handling, and workflow commands are real.
34. As an action maintainer, I want the deployed fixture to live in a fresh non-shallow Git repository at the action workspace root, so that the action's Git checks inspect the repository that Clever Cloud deploys.
35. As an action maintainer, I want support files and candidate source kept outside the fixture commit, so that Clever Cloud receives only the intended test application.
36. As an action maintainer, I want controlled commits for each source change, so that each deployment has a known local and remote Git state.
37. As an action maintainer, I want a real divergent history for the force case, so that `force: true` proves a non-fast-forward push can succeed.
38. As an action maintainer, I want an initial healthy deployment checked over public HTTP, so that image startup, routing, and response content all receive proof.
39. As an action maintainer, I want `CC_HEALTH_CHECK_PATH` set to the fixture health endpoint, so that Clever Cloud also checks application health during deployment.
40. As an action maintainer, I want the fixture to expose `INSTANCE_ID`, `INSTANCE_TYPE`, `CC_DEPLOYMENT_ID`, and `CC_COMMIT_ID`, so that tests can compare remote deployment state without guessed identifiers.
41. As an action maintainer, I want the fixture to return only allow-listed environment values, so that credentials cannot appear in its public response.
42. As an action maintainer, I want `setEnv` tested with a generated base64 value containing `==` padding, so that a realistic value with multiple equals signs survives parsing and remote storage.
43. As an action maintainer, I want the generated value compared without printing it, so that the test follows safe log habits even though the value is fake.
44. As an action maintainer, I want `quiet` and `logFile` used together on a successful deployment, so that raw remote logs can be checked without relying on console output.
45. As an action maintainer, I want the saved log checked for known build and startup markers, so that the file proves the deployment output reached the configured sink.
46. As an action maintainer, I want the default same-commit error checked, so that a duplicate commit fails with the expected message and creates no deployment.
47. As an action maintainer, I want `sameCommitPolicy: ignore` checked, so that it succeeds without changing the production instance, deployment, or activity count.
48. As an action maintainer, I want `sameCommitPolicy: restart` checked, so that it creates new production instance and deployment IDs while using the build cache.
49. As an action maintainer, I want `sameCommitPolicy: rebuild` checked, so that it creates new production IDs, bypasses the build cache, and reruns the install marker.
50. As an action maintainer, I want a controlled build failure checked, so that the action reports a failed remote build and preserves the last healthy production instance.
51. As an action maintainer, I want a controlled startup failure checked, so that the action reports a failed start and preserves the last healthy production instance.
52. As an action maintainer, I want failed deployments matched by commit and activity data, so that the test does not confuse them with an earlier deployment.
53. As an action maintainer, I want a healthy deployment after both failure cases, so that the action proves it can recover and continue the ordered flow.
54. As an action maintainer, I want a non-fast-forward deployment without force to fail and create no replacement deployment, so that the negative force case is real.
55. As an action maintainer, I want the same divergent commit deployed with `force: true`, so that the positive force case changes the running application.
56. As an action maintainer, I want the timeout case placed last, so that its remote work cannot interfere with later deployment scenarios.
57. As an action maintainer, I want a delayed remote build to outlast the action timeout, so that the action's timeout path runs against a real deployment.
58. As an action maintainer, I want the timed-out action step to succeed with its expected timeout message, so that the suite checks the action's documented non-failing timeout contract.
59. As an action maintainer, I want the timed-out remote deployment found by commit ID and cancelled, so that teardown does not race an active build.
60. As an action maintainer, I want cancellation to reach a final cancelled state before deletion, so that cleanup follows a known remote state.
61. As an action maintainer, I want the prior healthy commit checked after cancellation, so that timeout does not replace the running application.
62. As an action maintainer, I want every expected failure followed by an explicit outcome check, so that `continue-on-error` cannot turn an unexpected success into a passing suite.
63. As an action maintainer, I want any unexpected result to stop the remaining scenarios and proceed to evidence collection and teardown, so that one bad state does not produce misleading later results.
64. As an action maintainer, I want failed runs to upload action logs, scenario results, application IDs, commit IDs, and deployment IDs, so that remote faults can be diagnosed after cleanup.
65. As an action maintainer, I want successful runs to avoid uploading those files, so that retained data stays small.
66. As an action maintainer, I want artifacts to exclude credentials and real secret values, so that failure evidence remains safe to inspect.
67. As a contributor, I want helper modules tested without Clever Cloud access, so that most faults receive fast local feedback.
68. As a contributor, I want the fixture tested as a local Node.js process, so that health responses and failure modes do not require a live app for every code change.
69. As a contributor, I want Git history setup tested in temporary repositories, so that commit and divergence logic remains predictable.
70. As a contributor, I want preview builds to run when action metadata, E2E code, or E2E workflows change, so that a manual live run has a SHA-tagged image to consume.
71. As a contributor, I want documentation-only changes excluded from preview builds, so that they do not use registry or build time.
72. As a maintainer, I want separate Buildx cache scopes for internal pull requests, fork previews, and release builds, so that a less trusted build cannot feed cached layers into a more trusted build.
73. As a maintainer, I want the current top-level empty permission policy kept, so that each E2E job opts into only the GitHub access it needs.
74. As a maintainer, I want pull request values passed to scripts through environment variables or typed workflow inputs, so that workflow expressions cannot inject shell commands.
75. As a maintainer, I want an operations guide for environment setup, manual runs, app naming, and cleanup, so that another maintainer can run and repair the suite.
76. As a contributor, I want a contributor guide that links to the E2E operations guide, so that user documentation remains focused on action consumers.

## Implementation Decisions

### Preview and trust orchestration

- The preview workflow will handle pull request open, update, reopen, and ready events for relevant paths.
- The whole preview workflow will use a per-pull-request concurrency group with `cancel-in-progress` disabled.
- Native concurrency will never cancel the running workflow. It may replace an older pending workflow with the latest pending update before either creates an app.
- A ready event will wait behind the running update for the same pull request. If it replaces an older pending update, it will resolve or build its own exact head SHA before E2E.
- The candidate identity consists of the repository, pull request number, current head SHA, author, branch, draft state, and Release Please label.
- Automatic E2E requires head repository equality with the current repository, author `github-actions[bot]`, the project's Release Please branch pattern for `master`, the `autorelease: pending` label, and a non-draft pull request.
- Pull request runs may use workflow definitions changed by the candidate. The protected environment approval is the final trust boundary before candidate workflow code or the candidate image receives credentials.
- The environment reviewer must check the workflow diff, pull request identity, and exact candidate SHA before approval.
- The workflow will re-read pull request state immediately before app creation. A stale automatic run will record `superseded` in its summary, run no provisioning or scenarios, and complete successfully.
- The manual entry point will accept one full commit SHA. It will require exactly one open internal pull request whose current head matches that SHA.
- The manual dispatch must target that pull request's current branch. Before credentials become available, validation must require the workflow run SHA and approved input SHA to match.
- A stale manual run will fail before app creation.
- Fork candidates will never enter the live suite.
- The existing manual fork preview flow will remain separate. It will never invoke live E2E or receive Clever Cloud credentials.
- E2E remains advisory. It will not add a required branch gate.

### Reusable live suite

- One reusable workflow will own the complete live suite. Automatic and manual workflows will act as thin callers.
- The automatic caller will pass the digest produced or resolved by the preview build.
- The manual caller will resolve `git-<sha>` from the registry after candidate validation.
- Both callers will pass the pull request number, head SHA, verified image digest, and candidate source identity.
- Runs for the same pull request will be serialised. Only the running and latest pending runs are retained. Runs for different pull requests may overlap.
- Every candidate action call will have a bounded timeout. Normal scenarios will allow at most 1,200 seconds. The planned timeout scenario will allow 60 seconds while its remote build delay lasts at least 180 seconds.
- Expected action failures will use step-level error continuation followed by explicit assertions.
- Unexpected failures will skip later scenarios while still allowing failure evidence and teardown steps to run.

### Candidate image and action metadata

- The immutable source identity is the full pull request head SHA, not the mutable pull request tag.
- The workflow will inspect the SHA-tagged image and require its revision label to equal the requested head SHA.
- The image source label must identify the current repository and head SHA. An image labelled for a fork will be rejected even if it occupies the expected SHA tag.
- The workflow will pin the action to the resolved image digest.
- A ready event will reuse an existing verified SHA image. It will build the image only when that image is absent.
- The local action metadata will come from the candidate source. The workflow will replace only the image value with the verified digest.
- GitHub Actions will invoke each deployment through explicit local `uses` steps.
- Preview path filters will include Docker image inputs, action metadata, E2E source, and E2E workflow definitions. General documentation will remain excluded.
- Buildx caches will use separate scopes for each internal pull request, each vetted fork pull request, and release builds. Trusted builds will not restore fork cache entries.

### Authentication and permissions

- The suite will use a protected GitHub Environment named for Clever Cloud E2E access.
- The environment will hold `CLEVER_TOKEN` and `CLEVER_SECRET` secrets.
- The environment will hold a non-secret `CLEVER_E2E_REGION` variable, with `par` as the documented default.
- The suite will create applications in the authenticated user's personal account and will not pass an organisation owner.
- Credentials will appear only on steps that invoke Clever Tools or the candidate action.
- Credentials will not appear at workflow or job scope.
- The suite will not call `clever login`.
- Candidate dependencies will be installed from the lockfile with lifecycle scripts disabled.
- Host-side control operations will use the candidate's Clever Tools binary.
- GitHub permissions will remain empty by default. Jobs will opt into read access for source and pull request validation only where required.
- Values derived from pull requests or workflow inputs will not be inserted directly into shell scripts.

### Application lifecycle controller

- A dedicated TypeScript control module will own all host-side Clever Tools calls. Its public operations will cover app creation, deletion, activity lookup, log lookup, deployment cancellation, and bounded status waiting.
- The module will return parsed domain values rather than raw command output to the workflow.
- Every Clever Tools process and HTTP request will have its own deadline. A hung create, inspect, log, cancel, delete, or health request must return a useful error and allow later teardown steps to run.
- App names will use a fixed E2E prefix plus the GitHub run ID and attempt number.
- Creation will request the Node.js runtime in the configured region and personal account.
- The create operation must return a valid application ID before the workflow marks creation successful.
- Teardown will run only when the create step completed successfully.
- Before deletion, teardown will find active deployments for the exact application ID, cancel them, and wait at most 10 minutes for final states.
- Teardown will delete by exact application ID, then query Clever Cloud to confirm that the app no longer exists.
- Cleanup failure will fail the suite and print the exact app ID and name for manual repair.
- The first version will not add scheduled orphan cleanup.

### Git fixture builder

- A TypeScript Git module will create and update the repository deployed by Clever Cloud.
- Candidate source and test tools will be checked out beneath the workspace without making that checkout the deployed repository.
- Every source checkout will disable persisted GitHub credentials so candidate code and the candidate container cannot read a token from nested Git configuration.
- The workspace root will become a fresh Git repository on `master` with local test author details and a full, non-shallow history.
- Only fixture files will enter its commits. Candidate source, generated action metadata, logs, state, and tools will remain untracked and excluded from Git status.
- The fixture builder will create named commits for healthy changes, failure cases, recovery, forced divergence, and timeout.
- The force case will reset to a known ancestor and create a new commit that diverges from the remote head.
- The generated Clever link from provisioning will be removed before the first action call.
- Every deployment action call will receive the captured `appID`.

### Remote Node.js harness

- The fixture will be a dependency-free Node.js HTTP application.
- The application will listen on the Clever Cloud `PORT` value.
- `/health` will return JSON containing the scenario name, an allow-listed test value, `INSTANCE_ID`, `INSTANCE_TYPE`, `CC_DEPLOYMENT_ID`, and `CC_COMMIT_ID`.
- Startup logs will print a stable marker and the same platform fields.
- The response and logs will never include Clever Cloud credentials or arbitrary environment values.
- `E2E_SCENARIO` will select healthy, build-failure, startup-failure, and slow-build behaviour.
- Each action call will set the scenario required by that deployment through its `setEnv` input. This keeps scenario control inside the public action contract.
- A fixture script used by `CC_POST_BUILD_HOOK` will implement build failure and build delay. This keeps those cases reliable when dependency caches exist.
- A `postinstall` marker will show whether dependency installation ran. Restart should restore cache and skip this marker. Rebuild should bypass cache and emit it.
- Startup failure will come from the application process so that it exercises Clever Cloud's start validation.
- `CC_HEALTH_CHECK_PATH` will point to `/health`.
- The set-env check will generate a random 16-byte value, encode it as base64 with `==` padding, and compare it without printing it.
- The action's built-in masking will handle values supplied through `setEnv`; the workflow will not add a second mask for the fake value.

### Deployment observer

- A TypeScript observer module will combine public health responses with parsed Clever Tools activity and logs.
- It will identify deployments by application ID, commit ID, and deployment ID rather than list position alone.
- All polling will have a fixed upper bound and useful timeout errors.
- Successful deployment checks will require both Clever Cloud completion and a valid public `/health` response.
- Failed deployment checks will require the expected action outcome, expected log marker, matching failed activity, and continued service from the prior healthy commit.
- Same-commit `error` will require a failure message and no new activity.
- Same-commit `ignore` will require success, no new activity, and unchanged production instance and deployment IDs.
- Same-commit `restart` will require changed production instance and deployment IDs, unchanged commit ID, and no new `postinstall` marker.
- Same-commit `rebuild` will require changed production IDs, unchanged commit ID, the `without using cache` message, and a new `postinstall` marker.
- Non-fast-forward failure will require action failure, no replacement activity, and the previous healthy response.
- Forced deployment will require success and a health response from the divergent commit.
- Timeout will require action success with the documented timeout message. The observer will find the new deployment by commit, cancel it, wait for a cancelled final state, and confirm that the prior healthy commit remains live.

### Ordered scenario flow

1. Create the app and remove the provisioning link.
2. Deploy the first healthy commit with `appID` and validate Clever Cloud health plus public HTTP health.
3. Deploy a new healthy commit with `setEnv`, `quiet`, and `logFile`; validate the base64 value and saved build and startup markers.
4. Run same-commit `error`, `ignore`, `restart`, and `rebuild` checks in that order.
5. Deploy a new commit with a post-build failure and confirm that the prior healthy app remains live.
6. Deploy a new commit with startup failure and confirm that the prior healthy app remains live.
7. Deploy a healthy recovery commit.
8. Create divergent Git history, confirm a normal deploy fails, then deploy the same commit with `force: true` and validate it.
9. Create a child commit with a slow post-build hook and run the action with a short timeout.
10. Find and cancel the timed-out remote deployment, confirm its final state, and confirm the prior healthy app remains live.
11. Collect failure evidence when needed.
12. Delete the application and verify deletion.

### Evidence and documentation

- A reporting module will write structured scenario results as the suite runs.
- On failure, the workflow will upload redacted action log files, scenario results, application identity, Git commit IDs, and Clever deployment IDs with a short retention period.
- The credential-bearing control and cleanup step will redact the token, secret, and common encoded forms from artifact candidates, then scan them before upload.
- If redaction or scanning fails, the workflow will skip artifact upload and fail the run.
- The artifact upload step itself will not receive Clever Cloud credentials.
- Successful runs will rely on the workflow summary and will not upload these artifacts.
- Reports and artifacts will exclude credentials and real secret values.
- A contributor guide will describe project development entry points and link to a focused E2E operations guide.
- The E2E guide will cover protected environment setup, required secrets, the region variable, approval rules, personal-account ownership, manual dispatch, app naming, evidence, and manual cleanup.
- User-facing action documentation will remain focused on action use rather than contributor operations.

## Testing Decisions

- Good tests will check visible behaviour and stable contracts. They will avoid assertions about helper call order, private data shapes, or exact full Clever Cloud log output unless the wording is part of the action contract.
- TypeScript helper tests will run through the existing Vitest and type-check command.
- The application lifecycle controller will be tested with a stub process boundary. Tests will cover command arguments, JSON parsing, expected failures, invalid output, status polling, cancellation, deletion verification, and bounded waits.
- The Git fixture builder will be tested against temporary real Git repositories. Tests will cover initial repository state, controlled commits, ignored support files, non-shallow history, reset, and true divergent history.
- The remote harness will run as a local child process in tests. Tests will cover health JSON, allow-listed values, startup markers, startup failure, build-hook failure, build-hook delay with a short test bound, and absence of credential fields.
- The deployment observer will be tested with fake activity, log, and HTTP responses. Tests will cover deployment matching, unchanged and changed IDs, prior healthy state after failure, timeout, cancellation, and useful errors when state never arrives.
- Candidate image resolution will be tested with fake registry inspection output. Tests will cover matching revisions, missing tags, wrong revision labels, and digest extraction.
- Action metadata generation will be tested by checking that candidate metadata is copied and only the image value is replaced.
- Evidence generation will be tested for required IDs and markers, raw and encoded credential redaction, scan failures, and refusal to upload after a failed scan.
- Workflow conditions will receive focused checks for internal versus fork pull requests, draft and ready states, Release Please identity, stale SHA handling, automatic clean skips, and manual failures.
- Static workflow checks will require every checkout used by E2E to disable persisted credentials.
- Existing tests for configuration, deployment orchestration, Clever Tools invocation, child processes, Git checks, output handling, release scripts, and workflow platform declarations provide prior examples for process stubs, stream assertions, temporary files, and static workflow checks.
- The live reusable workflow is the final acceptance test. It will check GitHub's Docker action runtime and real Clever Cloud behaviour that local tests cannot represent.
- Expected remote failures count as passing scenarios only after the workflow proves both the expected failure and the continued health of the prior production deployment.
- Cleanup is part of acceptance. A run cannot pass when app deletion or deletion verification fails.

## Out of Scope

- Running live E2E on every pull request.
- Running live E2E for fork pull requests.
- Replacing the personal Clever Cloud account with a dedicated account or organisation.
- Scheduled cleanup of orphaned E2E applications.
- Cancelling in-progress workflows for stale commits.
- Serialising live suites across different pull requests.
- Making E2E a required branch protection check.
- Live coverage for `alias` and `deployPath`; existing local tests remain responsible for them.
- Live tests for malformed input, invalid environment names, missing applications, or invalid aliases.
- Testing every timeout boundary or every unsupported same-commit value.
- Direct use of Clever Cloud internal client libraries or hand-written REST authentication.
- Testing more than one region in a single run.
- Keeping a permanent test application or pool of applications.
- Uploading artifacts for successful runs.
- Moving contributor E2E setup into the user-facing action documentation.
- Adding a local command that imitates GitHub's Docker action runner.

## Further Notes

A live probe with Clever Tools 4.11.0 confirmed the assumptions used by this design:

- `sameCommitPolicy: error` failed without changing the running app.
- `sameCommitPolicy: ignore` kept the same production `INSTANCE_ID` and `CC_DEPLOYMENT_ID` and created no activity.
- `sameCommitPolicy: restart` created new production instance and deployment IDs while restoring the build cache.
- `sameCommitPolicy: rebuild` created new production IDs, printed `without using cache`, skipped cache restore, and reran `postinstall`.
- The fixture startup observed `INSTANCE_TYPE=production`. The probe did not observe a separate server start with `INSTANCE_TYPE=build`.
- Clever Cloud did not run the package `build` script by default, which is why this design uses a post-build hook for build cases and `postinstall` only as a cache marker.
- The disposable probe applications were deleted and their absence was verified.

The full flow performs about nine remote deployments, including failed and cancelled deployments. Restricting automatic runs to ready Release Please candidates keeps this load low while still testing the release image.

Without an orphan cleaner, runner loss or forced workflow cancellation can still leave an application behind. Creation could also succeed remotely before the controller captures a usable ID. Unique names, exact IDs, clear summaries, no in-progress cancellation, and documented manual cleanup reduce the risk but do not remove it.
