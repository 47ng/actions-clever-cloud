# Deploy to Clever Cloud

[![Marketplace](https://img.shields.io/github/v/release/47ng/actions-clever-cloud?label=Marketplace)](https://github.com/marketplace/actions/deploy-to-clever-cloud)
[![MIT License](https://img.shields.io/github/license/47ng/actions-clever-cloud.svg?color=blue)](https://github.com/47ng/actions-clever-cloud/blob/master/LICENSE)
[![CI/CD](https://github.com/47ng/actions-clever-cloud/workflows/CI/CD/badge.svg)](https://github.com/47ng/actions-clever-cloud/actions)
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
  - uses: actions/checkout@v3
    with:
      fetch-depth: 0

  # Deploy your application
  - uses: 47ng/actions-clever-cloud@v1.2
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
- uses: 47ng/actions-clever-cloud@v1.2
  with:
    alias: my-app-alias
  env:
    CLEVER_TOKEN: ${{ secrets.CLEVER_TOKEN }}
    CLEVER_SECRET: ${{ secrets.CLEVER_SECRET }}
```

If you don't have this `.clever.json` file or you want to explicly
deploy to another application, you can pass its ID:

```yml
- uses: 47ng/actions-clever-cloud@v1.2
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

## Extra Environment Variables

> Support: introduced in v1.2

You can set extra environment variables on the deployed application under the
`setEnv` option. It follows the same syntax as .env files (newline-separated,
key=value).

```yml
- uses: 47ng/actions-clever-cloud@v1.2
  with:
    setEnv: | # <- note the pipe here..
      FOO=bar
      EGG=spam
    # ^-- ..and the indentation here
  env:
    CLEVER_TOKEN:  ${{ secrets.CLEVER_TOKEN }}
    CLEVER_SECRET: ${{ secrets.CLEVER_SECRET }}
```

> _Note: you need to use a [literal block scalar](https://yaml-multiline.info/) `|` to preserve newlines in a YAML string._

Environment variables will be set before the application is deployed,
to let the new deployment use them.

### Caveats

Multi-line environment variable values (eg: SSH keys, X.509 certificates) are
currently not supported (due to splitting on newline), but contributions are welcome.

If the deployment fails, the environment variables will still have been
updated. This could be a problem if your app restarts or scales up, as
the new instance would use the new variable.

In the future, we might include a way to rollback environment variables
set by this action if deployment fails.

## Deployment Timeout

> Support: introduced in v1.2

Because build minutes are precious, and also because of two ongoing issues in
the Clever Tools CLI (
[#318](https://github.com/CleverCloud/clever-tools/issues/318),
[#319](https://github.com/CleverCloud/clever-tools/issues/319)),
you can specify a timeout in seconds after which the workflow will move on,
regardless of the deployment status:

```yml
- uses: 47ng/actions-clever-cloud@v1.2
  with:
    timeout: 1800 # wait at maximum 30 minutes before moving on
  env:
    CLEVER_TOKEN:  ${{ secrets.CLEVER_TOKEN }}
    CLEVER_SECRET: ${{ secrets.CLEVER_SECRET }}
```

## Force deployement

> Support: introduced in v1.2

Clever Cloud uses a Git remote to perform deploys. By default, if the commit you want to deploy is not a fast-forward from the commit currently deployed, the deploy will be rejected. You can pass `force: true` to force the deploy anyway:

```yml
- uses: 47ng/actions-clever-cloud@v1.2
  with:
    appID: app_facade42-cafe-babe-cafe-deadf00dbaad
    force: true
  env:
    CLEVER_TOKEN: ${{ secrets.CLEVER_TOKEN }}
    CLEVER_SECRET: ${{ secrets.CLEVER_SECRET }}
```

## Versioning

This action follows [SemVer](https://semver.org/).

To specify the version of the action to use:
- `uses: 47ng/actions-clever-cloud@v1.2`: latest stable version
- `uses: 47ng/actions-clever-cloud@3e5402496b8d6492401ebb3134acfeccc25c3fce`: pinned to a specific Git SHA-1 (check out the [releases](https://github.com/47ng/actions-clever-cloud/releases))
- `uses: docker://47ng/actions-clever-cloud:latest`: latest code from master (not recommended, as it may break: hic sunt dracones.)

## Why ?

Clever Cloud lets you connect your GitHub repository so that any push is
deployed. This is great for staging environments, but in some cases you
may want to deploy to production only on specific events, like a release
being published, or after a CI run.

## License

[MIT](https://github.com/47ng/actions-clever-cloud/blob/master/LICENSE) - Made with ❤️ by [François Best](https://francoisbest.com)

Using this action at work ? [Sponsor me](https://github.com/sponsors/franky47) to help with support and maintenance.
