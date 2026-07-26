# Deploy to Clever Cloud

[![Marketplace](https://img.shields.io/github/v/release/47ng/actions-clever-cloud?label=Marketplace)](https://github.com/marketplace/actions/deploy-to-clever-cloud)
[![MIT License](https://img.shields.io/github/license/47ng/actions-clever-cloud.svg?color=blue&label=License)](https://github.com/47ng/actions-clever-cloud/blob/master/LICENSE)
[![CI/CD](https://github.com/47ng/actions-clever-cloud/workflows/CI/CD/badge.svg)](https://github.com/47ng/actions-clever-cloud/actions)
[![GitHub Sponsors](https://img.shields.io/github/sponsors/franky47?color=%23db61a2&label=Sponsors)](https://github.com/sponsors/franky47)

GitHub action to deploy your application to [Clever Cloud](https://clever-cloud.com).

## Prerequisite

⚠️ When creating an application on Clever Cloud, you have to choose
between deploying "_from a local repository_" (using Clever CLI, Git
or SFTP) or "_from a Github repository_" (using a webhook setup
automatically by Clever Cloud). Only the first type of applications
can be deployed using this Github action.

In your project's `.clever.json`, if the `deploy_url` value starts
with `https://github.com/`, your application is meant to be deployed
"_from a Github repository_" only.
If you try deploying it with this Github action, you will get the
following message in your logs: `[ERROR] HTTP Error: 401 Authorization
Required`.

The only workaround is to create a new
application on Clever Cloud, that deploys "_from a local repository_",
then remove the Clever Cloud webhook that has been created on your
Github repository.

## Usage

In your workflow file:

<!-- x-release-please-start-version -->
```yml
steps:
  # This action requires an unshallow working copy,
  # so the following prerequisites are necessary:
  - uses: actions/checkout@v7
    with:
      fetch-depth: 0

  # Deploy your application
  - uses: 47ng/actions-clever-cloud@v2.1.5
    env:
      CLEVER_TOKEN: ${{ secrets.CLEVER_TOKEN }}
      CLEVER_SECRET: ${{ secrets.CLEVER_SECRET }}
```
<!-- x-release-please-end -->

This minimal example assumes you have only one application for this
repository that was linked with `clever link`, and the `.clever.json`
file is versioned at the root of the repository. If that's not the case,
read on:

## Specifying the application to deploy

Clever Cloud uses a `.clever.json` file at the root of your repository
to link to application IDs.

If you have committed the `.clever.json` file, you only need to specify
the alias of the application to deploy:

<!-- x-release-please-start-version -->
```yml
- uses: 47ng/actions-clever-cloud@v2.1.5
  with:
    alias: my-app-alias
  env:
    CLEVER_TOKEN: ${{ secrets.CLEVER_TOKEN }}
    CLEVER_SECRET: ${{ secrets.CLEVER_SECRET }}
```
<!-- x-release-please-end -->

If you don't have this `.clever.json` file or you want to explicly
deploy to another application, you can pass its ID:

<!-- x-release-please-start-version -->
```yml
- uses: 47ng/actions-clever-cloud@v2.1.5
  with:
    appID: app_facade42-cafe-babe-cafe-deadf00dbaad
  env:
    CLEVER_TOKEN: ${{ secrets.CLEVER_TOKEN }}
    CLEVER_SECRET: ${{ secrets.CLEVER_SECRET }}
```
<!-- x-release-please-end -->

If you set both `alias` and `appID`, `appID` takes precedence and `alias` is ignored.

Application IDs can be found in the [Clever Cloud console](https://console.clever-cloud.com/),
at the top-right corner of any page for a given app, or in the Information tab.
They look like `app_{uuidv4}`.

The first deploy with a given `appID` links it via `clever link`, which writes
a `.clever.json` file into the working tree (or `deployPath`, if you set one).

## Authentication

You will need to pass a token and a secret for authentication, via the
`CLEVER_TOKEN` and `CLEVER_SECRET` environment variables.

At the time of writing, the only way to obtain those credentials is to
re-use the ones generated for a local CLI. For that:

1. Install the [`clever-tools`](https://github.com/CleverCloud/clever-tools) CLI locally
2. Login on the CLI with `clever login` and follow the Web login process
3. Extract the credentials:

```shell
$ cat ~/.config/clever-cloud/clever-tools.json
{"token":"[token]","secret":"[secret]"}
```

4. In your repository settings, [add the following secrets](https://help.github.com/en/actions/automating-your-workflow-with-github-actions/creating-and-using-encrypted-secrets):

- `CLEVER_TOKEN`: the `token` value in the credentials
- `CLEVER_SECRET`: the `secret` value in the credentials

## Extra environment variables

> Support: introduced in v1.2.0

You can set extra environment variables on the deployed application under the
`setEnv` option. It follows the same syntax as .env files (newline-separated,
key=value).

<!-- x-release-please-start-version -->
```yml
- uses: 47ng/actions-clever-cloud@v2.1.5
  with:
    setEnv: | # <- note the pipe here..
      FOO=bar
      EGG=spam
    # ^-- ..and the indentation here
  env:
    CLEVER_TOKEN: ${{ secrets.CLEVER_TOKEN }}
    CLEVER_SECRET: ${{ secrets.CLEVER_SECRET }}
```
<!-- x-release-please-end -->

> **Note**: you need to use a [literal block scalar](https://yaml-multiline.info/) `|` to preserve newlines in a YAML string.

Environment variables will be set before the application is deployed,
to let the new deployment use them.

### Caveats

Multi-line environment variable values (eg: SSH keys, X.509 certificates) are
currently not supported (due to splitting on newline), but contributions are welcome.

A `setEnv` line that is not valid `KEY=value` (bad characters in the key or
broken quoting) is skipped. The action logs a warning and continues without
that variable.

If the deployment fails, or setting the variables fails partway through, the
ones already applied will still be live. This could be a problem if your app
restarts or scales up, as the new instance would use the new variable.

In the future, we might include a way to rollback environment variables
set by this action if deployment fails.

## Deployment timeout

> Support: introduced in v1.2.0

Because build minutes are precious, and also because of two ongoing issues in
the Clever Tools CLI (
[#318](https://github.com/CleverCloud/clever-tools/issues/318),
[#319](https://github.com/CleverCloud/clever-tools/issues/319)),
you can specify a timeout in seconds after which the workflow will move on,
regardless of the deployment status:

<!-- x-release-please-start-version -->
```yml
- uses: 47ng/actions-clever-cloud@v2.1.5
  with:
    timeout: 1800 # wait at maximum 30 minutes before moving on
  env:
    CLEVER_TOKEN: ${{ secrets.CLEVER_TOKEN }}
    CLEVER_SECRET: ${{ secrets.CLEVER_SECRET }}
```
<!-- x-release-please-end -->

When the timeout is reached, the action stops waiting and moves on, but the
deployment on Clever Cloud keeps running. Nothing tells Clever Cloud to
cancel it.

If the timeout fires during the push itself, the process is killed, the
step still succeeds, and nothing was ever deployed.

Give the action step an ID to check whether it timed out:

<!-- x-release-please-start-version -->
```yml
- name: Deploy
  id: deploy
  uses: 47ng/actions-clever-cloud@v2.1.5
  with:
    timeout: 1800
  env:
    CLEVER_TOKEN: ${{ secrets.CLEVER_TOKEN }}
    CLEVER_SECRET: ${{ secrets.CLEVER_SECRET }}

- name: Handle a timed-out deployment
  if: steps.deploy.outputs.timedOut == 'true'
  run: echo "The deployment is still running on Clever Cloud"
```
<!-- x-release-please-end -->

The `timedOut` output is `true` when the action reaches the timeout. It stays
`false` when the action does not reach the timeout. This includes deployment
failures.

`timeout` must be a non-negative integer number of seconds, up to 86400
(24 hours). No timeout is already the default; `0` is only useful when the
value comes from an expression that may evaluate to zero. Any other value
fails the step.

## Force deployement

> Support: introduced in v1.2.0

Clever Cloud uses a Git remote to perform deploys. By default, if the commit you want to deploy is not a fast-forward from the last commit pushed to that remote, the deploy will be rejected. You can pass `force: true` to force the deploy anyway:

<!-- x-release-please-start-version -->
```yml
- uses: 47ng/actions-clever-cloud@v2.1.5
  with:
    appID: app_facade42-cafe-babe-cafe-deadf00dbaad
    force: true
  env:
    CLEVER_TOKEN: ${{ secrets.CLEVER_TOKEN }}
    CLEVER_SECRET: ${{ secrets.CLEVER_SECRET }}
```
<!-- x-release-please-end -->

## Deploying a specific app from a monorepo

> Support: introduced in v2.1.0

Clever Cloud receives the whole Git repository. To deploy one app from a monorepo:

1.  Select the Clever Cloud target app with `alias` or `appID`.
2.  Set `APP_FOLDER` to the folder that contains the app:

<!-- x-release-please-start-version -->
```yml
- uses: 47ng/actions-clever-cloud@v2.1.5
  with:
    alias: backend
    setEnv: |
      APP_FOLDER=packages/backend
  env:
    CLEVER_TOKEN: ${{ secrets.CLEVER_TOKEN }}
    CLEVER_SECRET: ${{ secrets.CLEVER_SECRET }}
```
<!-- x-release-please-end -->

`APP_FOLDER` tells Clever Cloud which folder to build and run.
It does not change which files are sent.

### The `deployPath` option

`deployPath` changes the directory where this action runs the Clever CLI. Use
it when a subfolder has its own `.clever.json`.

It does not limit the files sent to Clever Cloud. The CLI searches parent
folders for the Git repository, then deploys its current commit. In a normal
monorepo, the whole repository is still sent.

## Same commit policy

> Support: introduced in v2.1.0

When the local and remote commits are identical, you can control what happens using the `sameCommitPolicy` option. Possible values are:

- `error` (default): Fail the deployment
- `ignore`: Skip the deployment without failing
- `restart`: Redeploy the same commit, reusing the build cache
- `rebuild`: Redeploy the same commit without the build cache

<!-- x-release-please-start-version -->
```yml
- uses: 47ng/actions-clever-cloud@v2.1.5
  with:
    sameCommitPolicy: restart
  env:
    CLEVER_TOKEN: ${{ secrets.CLEVER_TOKEN }}
    CLEVER_SECRET: ${{ secrets.CLEVER_SECRET }}
```
<!-- x-release-please-end -->

## Logs

> Support: introduced in v1.3.0

You can write the deployment logs to a file for archiving:

<!-- x-release-please-start-version -->
```yml
- uses: 47ng/actions-clever-cloud@v2.1.5
  with:
    logFile: ./clever-cloud-deploy.log
  env:
    CLEVER_TOKEN: ${{ secrets.CLEVER_TOKEN }}
    CLEVER_SECRET: ${{ secrets.CLEVER_SECRET }}
# Optional: save the file as an artifact
- uses: actions/upload-artifact@v4
  name: Upload deployment logs
  with:
    name: clever-cloud-deploy.log
    path: ./clever-cloud-deploy.log
    retention-days: 30
```
<!-- x-release-please-end -->

If your deployment process is susceptible to log secrets or PII, you can also
disable it from printing onto the console, using the `quiet` option:

<!-- x-release-please-start-version -->
```yml
- uses: 47ng/actions-clever-cloud@v2.1.5
  with:
    quiet: true
  env:
    CLEVER_TOKEN: ${{ secrets.CLEVER_TOKEN }}
    CLEVER_SECRET: ${{ secrets.CLEVER_SECRET }}
```
<!-- x-release-please-end -->

`quiet` only silences the console. If you also set `logFile`, the file
still gets the full deployment output.

The timeout message is an exception: it only reaches `logFile` when `quiet`
is set too. Without `quiet`, a timed-out deployment's log file just stops,
with nothing explaining why.

### Annotations

The action will detect the [workflow commands](https://docs.github.com/en/actions/using-workflows/workflow-commands-for-github-actions#setting-a-notice-message)
`::notice`, `::error`, and `::warning` being emitted from your deployment
logs, and will forward them so they can be used to annotate a run.

_Note: this behaviour will be disabled if the `quiet` option is used._

## Versioning

This action follows [SemVer](https://semver.org/).

To specify the version of the action to use:

- `uses: 47ng/actions-clever-cloud@v2.1.5`: latest stable version <!-- x-release-please-version -->
- `uses: 47ng/actions-clever-cloud@f496297399b2351f4459d10f556e1c4eff2566b7`: pinned to a specific Git SHA-1 (check out the [releases](https://github.com/47ng/actions-clever-cloud/releases))
- `uses: docker://ghcr.io/47ng/actions-clever-cloud:latest`: tracks the newest released version (moved there right after each release, not from an ordinary push to master)

> **Note**: `uses: 47ng/actions-clever-cloud@master` will not use the latest code on the `master` branch,
> because the action manifest is pinned on the latest relase for performance reasons (it saves
> rebuilding the Docker image when consuming the action).
>
> To test unreleased features, pin a `git-<sha>` preview image built for a pull request.

> **Note**: as of 2023-03-24, Docker images have been copied from Docker Hub
> (`47ng/actions-clever-cloud`) to GitHub Container Registry (`ghcr.io/47ng/actions-clever-cloud`),
> in response to Docker's plan to delete open source organisations on free plans.
>
> Although they backtracked on this decision, the images are now dual-published
> on both platforms, and default to being downloaded from GitHub Container Registry
> for (seemingly) better performance.

## Why ?

Clever Cloud lets you connect your GitHub repository so that any push is
deployed. This is great for staging environments, but in some cases you
may want to deploy to production only on specific events, like a release
being published, or after a CI run.

## License

[MIT](https://github.com/47ng/actions-clever-cloud/blob/master/LICENSE) - Made with ❤️ by [François Best](https://francoisbest.com)

Using this action at work ? [Sponsor me](https://github.com/sponsors/franky47) to help with support and maintenance.

