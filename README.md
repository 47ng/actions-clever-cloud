# Deploy to Clever Cloud

[![Marketplace](https://img.shields.io/github/v/release/47ng/actions-clever-cloud?label=Marketplace)](https://github.com/marketplace/actions/deploy-to-clever-cloud)
[![MIT License](https://img.shields.io/github/license/47ng/actions-clever-cloud.svg?color=blue)](https://github.com/47ng/actions-clever-cloud/blob/master/LICENSE)
[![CI/CD](https://github.com/47ng/actions-clever-cloud/workflows/CI/CD/badge.svg)](https://github.com/47ng/actions-clever-cloud/actions)
[![Dependabot Status](https://api.dependabot.com/badges/status?host=github&repo=47ng/actions-clever-cloud)](https://dependabot.com)
[![Average issue resolution time](https://isitmaintained.com/badge/resolution/47ng/actions-clever-cloud.svg)](https://isitmaintained.com/project/47ng/actions-clever-cloud)
[![Number of open issues](https://isitmaintained.com/badge/open/47ng/actions-clever-cloud.svg)](https://isitmaintained.com/project/47ng/actions-clever-cloud)

GitHub action to deploy your application to
[Clever Cloud](https://clever-cloud.com).

## Usage

In your workflow file:

```yml
steps:
  # This action requires an unshallow working copy,
  # so the following prerequisites are necessary:
  - uses: actions/checkout@v2
  - run: git fetch --prune --unshallow

  # Deploy your application
  - uses: 47ng/actions-clever-cloud@v0.5.0
    env:
      CLEVER_TOKEN: ${{ secrets.CLEVER_TOKEN }}
      CLEVER_SECRET: ${{ secrets.CLEVER_SECRET }}
```

This minimal example assumes you have only one application for this
repository that was linked with `clever link`, and the `.clever.json`
file is versioned at the root of the repository. If that's not the case,
read on:

## Specifying the application to deploy

Clever Cloud uses a `.clever.json` file at the root of your repository
to link to application IDs.

If you have committed the `.clever.json` file, you only need to specify
the alias of the application to deploy:

```yml
- uses: 47ng/actions-clever-cloud@v0.5.0
  with:
    alias: my-app-alias
  env:
    CLEVER_TOKEN: ${{ secrets.CLEVER_TOKEN }}
    CLEVER_SECRET: ${{ secrets.CLEVER_SECRET }}
```

If you don't have this `.clever.json` file or you want to explicly
deploy to another application, you can pass its ID:

```yml
- uses: 47ng/actions-clever-cloud@v0.5.0
  with:
    appID: app_facade42-cafe-babe-cafe-deadf00dbaad
  env:
    CLEVER_TOKEN: ${{ secrets.CLEVER_TOKEN }}
    CLEVER_SECRET: ${{ secrets.CLEVER_SECRET }}
```

Application IDs can be found in the [Clever Cloud console](https://console.clever-cloud.com/),
at the top-right corner of any page for a given app, or in the Information tab.
They look like `app_{uuidv4}`.

## Authentication

You will need to pass a token and a secret for authentication, via the
`CLEVER_TOKEN` and `CLEVER_SECRET` environment variables.

At the time of writing, the only way to obtain those credentials is to
re-use the ones generated for a local CLI. For that:

1. Install the [`clever-tools`](https://github.com/CleverCloud/clever-tools) CLI locally
2. Login on the CLI with `clever login` and follow the Web login process
3. Extract the credentials:

```shell
$ cat ~/.config/clever-cloud
{"token":"[token]","secret":"[secret]"}
```

4. In your repository settings, [add the following secrets](https://help.github.com/en/actions/automating-your-workflow-with-github-actions/creating-and-using-encrypted-secrets):
  - `CLEVER_TOKEN`: the `token` value in the credentials
  - `CLEVER_SECRET`: the `secret` value in the credentials

## Versioning

This action follows [SemVer](https://semver.org/).
Please note that the API is subject to breaking changes before reaching
1.0.0.

To specify the version of the action to use:
- `uses: 47ng/actions-clever-cloud@v0.5.0`: latest stable version
- `uses: 47ng/actions-clever-cloud@master`: latest code from master
- `uses: 47ng/actions-clever-cloud@v1.2.3`: a specific version

## Why ?

Clever Cloud lets you connect your GitHub repository so that any push is
deployed. This is great for staging environments, but in some cases you
may want to deploy to production only on specific events, like a release
being published, or after a CI run.

## Roadmap to 1.0.0

- [x] Test all 3 deployment cases:
  - [x] .clever.json, single app, no arguments
  - [x] .clever.json, multiple apps, alias
  - [x] .clever.json, explicit appID
  - [x] no .clever.json, appID
- [ ] Testing against [clevercloud/clever-tools#318](https://github.com/CleverCloud/clever-tools/issues/318) (process hanging) => might be hard to reproduce
- [ ] Provide early exit option => [clevercloud/clever-tools#319](https://github.com/CleverCloud/clever-tools/issues/319)
