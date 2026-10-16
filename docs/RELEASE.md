# Release process

Releases move through automated versioning, tagging, publication, then a manual
pre-release bump for next development cycle.

Published package metadata is `@freelensapp/agentbridge-extension`; repository
identity remains `freelensapp/freelens-agentbridge-extension` for trusted
publishing.

The `main` branch carries the 2.x line, which requires Freelens >= 2.0.0
(`engines.freelens: ^2.0.0`). Freelens 1.x users stay on the 1.x releases.
Users pick a release whose major version matches their Freelens version.

## Staged workflow changes

GitHub Actions cannot push changes to `.github/workflows/`, so the workflows
updated for the v2 port are staged in `github-workflow-fix/`: `check.yaml`,
`release.yaml`, `tag.yaml`, `type-check.yaml`, `integration-tests.yaml`
(against Freelens `main`), `mise-lock-check.yaml`, and `biome-migrate.yaml`.
A maintainer moves them into `.github/workflows/` and deletes the directory.
Until then, the workflows below behave as in the 1.x line; the differences are
noted where they matter.

## Required setup

Configure repository before first release:

- Create GitHub environments named `automated` and `publishing`. Limit access
  to trusted maintainers as needed.
- Add `GH_TOKEN` repository secret. Its token must have `contents: write` and
  `pull-requests: write` permissions so automation can create version PRs and
  tags.
- Configure npm trusted publishing for this exact source:
  `freelensapp/freelens-agentbridge-extension`, workflow
  `.github/workflows/release.yaml`, environment `publishing`.

The Release workflow uses GitHub OIDC for npm publishing. Do not configure npm
access tokens.

## Step 1: Trigger `Automated npm version`

Go to **Actions -> Automated npm version -> Run workflow** and choose a semver
bump. The workflow creates or updates `automated/npm-version` with the version
bump and refreshed lockfile, then opens a pull request.

| Input `newversion` | Example              |
| ------------------ | -------------------- |
| `patch`            | `0.1.0` -> `0.1.1`   |
| `minor`            | `0.1.0` -> `0.2.0`   |
| `major`            | `0.1.0` -> `1.0.0`   |
| `prerelease`       | `0.1.0` -> `0.1.1-0` |

For a stable release, select an input that produces an exact `X.Y.Z` version.
With the staged `tag.yaml`, a prerelease version such as `2.0.0-0` is tagged
and released as well (see Step 4).

## Step 2: Review and merge stable version PR

Review `package.json` and `pnpm-lock.yaml`, then merge the automated version PR
into `main`. A merged stable `X.Y.Z` version triggers `Automated tag`.

`Automated tag` reads `package.json` from the exact merged PR commit and creates
`vX.Y.Z` at that commit. It does not tag `main`'s later tip.

If automatic tagging needs retrying, a trusted repository owner, member, or
collaborator can comment exactly `/tag` on the closed, merged automated version
PR. The fallback rejects all other PRs and unmerged PRs.

## Step 3: Automatic `Release`

Pushing `vX.Y.Z` triggers `Release`, which:

1. Checks tag name matches `package.json` version.
2. Installs dependencies, builds `dist/` with `pnpm build`, and packs one
   extension `.tgz` archive.
3. Publishes with npm OIDC using `latest` for stable versions and `next` for
   versions with a prerelease suffix, such as `2.0.0-0`.
4. Creates GitHub Release and attaches generated `.tgz` archive. The staged
   `release.yaml` marks the GitHub Release as a prerelease when the tag has a
   prerelease suffix.

## Step 4: Start next pre-release version

After stable release completes, manually run `Automated npm version` with
`prerelease`, review and merge resulting PR. Example: `0.1.1` -> `0.1.2-0`.
With the current `tag.yaml`, pre-release versions do not create tags
automatically. The staged `tag.yaml` also tags `X.Y.Z-N` versions, so a merged
pre-release PR is published under `next` and released as a GitHub prerelease.
Start later stable release with another manual version bump PR.

## Workflow chain

```text
[Maintainer] workflow_dispatch -> Automated npm version
                                           |
                             (stable version PR merged)
                                           v
                                    Automated tag
                                           |
                    (vX.Y.Z created at merged PR commit)
                                           v
                                        Release
                                           |
                          build + pack + npm OIDC publish
                          latest (stable) / next (pre-release)
                                           |
                         GitHub Release + attached .tgz

Fallback: trusted maintainer comments /tag on closed, merged
          Automated npm version PR -> Automated tag

[Maintainer] workflow_dispatch -> Automated npm version (prerelease)
                                           |
                             (pre-release PR merged)
                                           v
                         next development version on main
```

## Pre-release checklist

- Run `pnpm lint:check`, `pnpm type:check`, `pnpm test:unit`,
  `pnpm knip:check`, and `pnpm build`.
- Confirm extension supports intended Freelens host version
  (`engines.freelens` in `package.json`, and the `Integration tests` workflow
  against that Freelens).
- Confirm `automated` and `publishing` environments, `GH_TOKEN` permissions,
  and npm trusted publisher configuration.
