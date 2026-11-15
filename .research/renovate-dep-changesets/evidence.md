# Evidence: changesets for Renovate PRs

All entries are dated 2026-11-15. Status is `open` unless noted.

## E1

- Claim: mscharley/dependency-changesets-action (v1.2.5, 2026-07-15) runs under `pull_request_target`. It maps a conventional-commit type to a bump and skips `chore(deps)`, so it writes nothing for Renovate's default commit messages unless the option is turned off. Its README recommends a PAT.
- Confidence: high.
- Source: <https://github.com/mscharley/dependency-changesets-action>, src/generateChangeset.ts.
- Source type: code.

## E2

- Claim: the-guild-org/changesets-dependencies-action writes a fixed `patch` and skips private packages and devDependencies. It has not been released since 2023-02.
- Confidence: medium.
- Source: <https://github.com/the-guild-org/changesets-dependencies-action>.
- Source type: code.

## E3

- Claim: @scaleway/changesets-renovate (4.0.6, 2026-10-23) writes a fixed `patch` and handles pnpm catalogs. It skips private packages, and skips devDependencies with an option. Scaleway's own workflow runs it under `pull_request_target` and pushes with `GITHUB_TOKEN`.
- Confidence: high.
- Sources: <https://github.com/scaleway/scaleway-lib/tree/main/packages/changesets-renovate> and <https://github.com/scaleway/scaleway-lib/blob/main/.github/workflows/changesets-renovate.yml>.
- Source type: code.

## E4

- Claim: psirenny/renovate-changesets (1.0.8, 2026-11-09, 1 star) runs as a Renovate `postUpgradeTasks` command. It writes a templated `patch` and honors changesets `ignore` and `privatePackages`.
- Confidence: high.
- Source: <https://github.com/psirenny/renovate-changesets>.
- Source type: code.

## E5

- Claim: `postUpgradeTasks` runs only allowlisted commands. On the hosted Mend app, free users cannot add to the allowlist. OSS projects can ask Mend, and paid plans can add commands.
- Confidence: high.
- Sources: <https://docs.renovatebot.com/configuration-options/#postupgradetasks>, <https://docs.renovatebot.com/mend-hosted/hosted-apps-config/#allowed-post-upgrade-commands> and <https://docs.renovatebot.com/mend-hosted/faq/>.
- Source type: official docs.

## E6

- Claim: renovate#47385 (opened 2026-10-25) adds `postUpdateOptions: changesets`. It writes `major` when a peer range narrows or a peer is added, otherwise `patch`, and it skips private and ignored packages. It is open, review is required, and the CLA is unsigned. The earlier request, renovate#19276, closed with "use gitIgnoredAuthors".
- Confidence: high on the PR's contents, low on whether it will merge.
- Sources: <https://github.com/renovatebot/renovate/pull/47385> and <https://github.com/renovatebot/renovate/issues/19276>.
- Source type: issue thread.

## E7

- Claim: Backstage uses its own `pull_request_target` workflow, which pushes with a service-account PAT and writes a fixed `patch`.
- Confidence: high.
- Source: <https://github.com/backstage/backstage/blob/master/.github/workflows/sync_renovate-changesets.yml>.
- Source type: code.

## E8

- Claim: `dep-changeset.yml` runs PR code with a read-only token and no secrets. It writes a `patch` only for labeled in-major updates whose type surface, `engines` floor, and peers checks all pass. It fails closed otherwise, and pushes with the AUTOFIX app token. `lib.mjs` reads `dependencies`, `optionalDependencies`, `peerDependencies` and pnpm catalogs, and covers public workspace packages only.
- Confidence: high.
- Sources: <https://github.com/cyberuni/.github/blob/main/.github/workflows/dep-changeset.yml> and <https://github.com/cyberuni/.github/blob/main/.github/scripts/dep-changeset/lib.mjs>.
- Source type: code.

## E9

- Claim: the repobuddy app's design keeps the work in Actions and makes the service a router. Its Probot starter is a placeholder.
- Confidence: high.
- Sources: <https://github.com/repobuddy/github-app/issues/40> and <https://github.com/repobuddy/github-app/blob/main/docs/research/probot-and-alternatives.md>.
- Source type: design doc.

## E10

- Claim: events caused by `GITHUB_TOKEN` start no new workflow runs. Newer wording says `pull_request` events from a PR the token creates or updates start runs that wait for approval. Whether a push to an existing branch counts is unclear.
- Confidence: high on the first part, medium on the second.
- Source: <https://github.com/github/docs/blob/main/data/reusables/actions/actions-do-not-trigger-workflows.md>.
- Source type: official docs.

## E11

- Claim: `cyberuni/path-equal` has a local `packageRules` entry that sets `automerge: false` on every major, which overrides the preset's devDependency and GitHub Actions automerge rules. Its `pull-request.yml` calls only `pnpm-verify.yml`. The published package has no runtime dependencies.
- Confidence: high.
- Source: <https://github.com/cyberuni/path-equal>, read through `gh api` on 2026-11-15.
- Source type: code.
