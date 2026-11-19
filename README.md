# .github

Organization setting repository.

[Default Community Health Files](https://docs.github.com/en/github/building-a-strong-community/creating-a-default-community-health-file)

[Starter Workflows](https://docs.github.com/en/actions/learn-github-actions/creating-starter-workflows-for-your-organization)

Use the workflow templates to create workflows for each repository.

References:

- <https://github.blog/changelog/2020-04-15-github-actions-new-workflow-features/>

## Versioning

### Which ref to pin

**Pin a tag, never `@main`.** Pin `@v2`. It is the line for `@changesets/cli`
v3, and `pnpm-release-changeset*.yml` uses `changesets/action@v2`.

```yaml
jobs:
  verify:
    uses: repobuddy/.github/.github/workflows/pnpm-verify.yml@v2
```

`v1` is retired. It is frozen at its last release and receives no fixes, so do
not pin it. A repo still on `@changesets/cli` v2 must move to v3 and pin `@v2`.

`v2` is a *moving* tag. It is re-pointed forward on every backward-compatible
release within its line, so you get fixes without doing anything. It is never
moved across a breaking change.

If you need a ref that never moves under you, pin the exact version instead
(`@v2.0.0`) and accept that you must bump it by hand to get any fix.

Do **not** pin `@main`. `main` is the development branch: it carries unreleased
and possibly broken work, and every consumer on it takes every change the
instant it merges. That is how a silently-broken release path reached five repos
([#43](https://github.com/repobuddy/.github/issues/43)).

### Why there are two lines

`changesets/action` and `@changesets/cli` are strictly paired, and the action
enforces the pairing itself:

| `changesets/action` | works with | inputs |
| --- | --- | --- |
| `v1` | `@changesets/cli` v2 | `version`, `publish`, `commit` |
| `v2` | `@changesets/cli` v3 | `version-script`, `publish-script`, `commit-message` |

Run action v2 against CLI v2 and it aborts with *"This version of the Changesets
action is designed to work with Changesets CLI v3. Changesets CLI v2 is not
supported; use Changesets action v1 instead."* There is no configuration that
makes one workflow serve both.

Every consumer is on `@changesets/cli` v3, so `main` is the v2 line and
`pnpm-release-changeset*.yml` uses `changesets/action@v2`. The `v1` tag is
frozen at the last v1 release and nothing is developed against it.

### The scheme

Semver tags plus a moving major alias — the GitHub Actions ecosystem
convention, and what `actions/*` itself does:

| Tag | Mutable? | Meaning |
| --- | --- | --- |
| `v1.0.0` | no | One exact release. Never re-pointed. |
| `v1` | yes | Latest `v1.x.y`. Re-pointed on each compatible release. |

This was chosen over an immutable-only scheme with full deliberation of the
tradeoff: a moving `v1` does hand back some of the instant-propagation problem
that `@main` had. It is still a large improvement, because the two are not
equivalent:

- `@main` propagates **everything**, including breaking changes and
  work-in-progress, with no one having decided it was safe.
- `@v1` propagates only what a maintainer explicitly judged backward
  compatible. A breaking change stops at the `v1` boundary and requires
  consumers to opt in by moving to `@v2`.

The moving alias is also what Dependabot and Renovate understand, and what
anyone reading a `uses:` line in this org will expect. An immutable-only scheme
is strictly safer but only if someone actually bumps the pins; a stale pin
nobody updates is a worse outcome than a moving tag. Consumers who want the
stricter guarantee can opt into `@v1.0.0` individually.

### Why this matters more here than in most repos

`main` in this repo is *not* hand-curated. `.mergify.yml` auto-merges Renovate
PRs, so dependency bumps to the actions these workflows call land on `main`
without a human in the loop — and under `@main` they reach every consumer the
moment they merge.

That is not hypothetical. `changesets/action` v1 → **v2**, a major upgrade with
renamed inputs and a hard CLI-version requirement, arrived as Renovate PR
[#42](https://github.com/repobuddy/.github/pull/42) on branch
`renovate/changesets-action-2.x` and was auto-merged. The Mergify rule intends
to hold majors back with `head~=^(?!major-)`, but Renovate does not prefix these
branches with `major-`, so the guard did not match and the major merged like any
patch. The result was [#43](https://github.com/repobuddy/.github/issues/43):
every consumer's release path broken at once, and none of them found out until
the next release was attempted.

Tagging fixes the consumer half of this — an auto-merged bump now lands on
`main` and waits there until someone cuts a release. The Mergify rule not
actually excluding majors is a separate defect and should be fixed on its own.

### Starting version: `v1.0.0`

Not `v0.x`. Two reasons:

1. These workflows are already in production use by five repos and have been
   for a long time. `v0.x` would advertise "expect this to break", which is a
   less honest description of the status quo than `v1` — and `@main` offered no
   stability guarantee whatsoever, so anything we tag is an improvement rather
   than a regression in stability.
2. The moving-major-alias convention is only coherent at `>= 1`. Under semver,
   `0.x` minor bumps are permitted to break, so a moving `v0` alias would carry
   breaking changes to every consumer automatically — precisely the failure mode
   this change exists to stop.

### What one version covers

**Everything in this repo shares one tag** — all reusable workflows plus the
composite actions (`setup-playwright`, `setup-node-pnpm`). They live in one repo, and a git tag names
a commit of the whole repo; there is no per-workflow versioning.

The consequence, stated plainly: **a change to any one workflow bumps the tag
for all consumers of all of them.** A repo that only uses `pnpm-verify.yml`
will still see version churn from an edit to `pnpm-release-semantic.yml`.
That churn is noise, not risk — the unchanged workflows are byte-identical
across the two tags.

If that churn ever becomes a real problem, the escape hatch is per-workflow tag
prefixes (`pnpm-verify/v1`). Do not reach for it pre-emptively; it multiplies
the release procedure by the number of workflows.

### What counts as breaking

A major bump is required when a change would break a consumer that changed
nothing on its side:

- removing or renaming a workflow, an action, or one of their inputs
- making a previously optional input required
- changing a default such that existing behavior changes
- requiring a secret that consumers did not previously have to set
- **requiring a new precondition in the consumer's own repo**

That last one is easy to miss and is exactly what the two lines encode: `v1`'s
contract includes "consumers of `pnpm-release-changeset*.yml` are on
`@changesets/cli` v2", and `v2`'s includes "…are on v3". Moving a consumer
across CLI majors means moving its pin in the same change.

## Release workflows

Two variants of the changesets release path, per line. They differ only in how
they authenticate to GitHub. Both publish to npm through trusted publishing
(OIDC), so both need a trusted publisher registered for each package (step 1
below) and neither reads `NPM_TOKEN`.

| Workflow | GitHub auth | npm auth |
| --- | --- | --- |
| `pnpm-release-changeset.yml` | `CI_GITHUB_TOKEN` | trusted publishing (OIDC) |
| `pnpm-release-changeset-oidc.yml` | built-in `GITHUB_TOKEN` | trusted publishing (OIDC) |

**Prefer the OIDC variant for new repos, and migrate existing ones.**
`CI_GITHUB_TOKEN` is a long-lived credential that expires silently and is worth
stealing; OIDC credentials are minted per run and last minutes. Trusted
publishing also emits provenance attestations.

Both take these optional inputs:

| Input | Default | Effect |
| --- | --- | --- |
| `node-version` | `'24'` | Node.js for the release job. |
| `pnpm-version` | from `packageManager` | pnpm for the release job. |
| `skip-playwright` | `false` | Skip the Playwright browser install before the build. |
| `install-vsce` | `false` | Install `vsce` globally, for a release that packages a VS Code extension. |

### Adopting the OIDC variant

1. Register a trusted publisher for **each published package** at
   `npmjs.com/package/<name>/access`, naming this repo and the **caller**
   workflow's filename — `release.yml`, not the reusable workflow's filename.
   Publishing fails with an auth error until this exists.
2. Point the caller at `pnpm-release-changeset-oidc.yml`.
3. Declare permissions **in the caller**. Declaring `permissions:` replaces the
   default set, so every scope the callee needs must be listed — unlisted ones
   drop to `none`, not to the default:

   ```yaml
   release:
     uses: repobuddy/.github/.github/workflows/pnpm-release-changeset-oidc.yml@v1
     needs: code
     permissions:
       id-token: write
       contents: write
       pull-requests: write
       actions: write
   ```

   `actions: write` lets the workflow approve the runs GitHub parks on the
   "version packages" PR (see below). Without it, the release still succeeds,
   but it warns and the PR's runs stay pending.

4. Your CI workflow no longer needs `workflow_dispatch:` in its `on:` block.
   An earlier version of this workflow dispatched CI that way; leaving the
   trigger in place is harmless.
5. Once a release has published successfully, delete `NPM_TOKEN` and
   `CI_GITHUB_TOKEN` from the repo's secrets.

Why the approval: changesets/action opens and pushes the "version packages" PR
with `GITHUB_TOKEN`, so the PR's author is `github-actions[bot]`. GitHub creates
the PR's `on: pull_request` runs (CI, CodeQL) but parks them as
`action_required` until someone approves them, and a ruleset that requires
their checks leaves the PR blocked. After changesets/action opens or updates the
PR, the workflow finds the parked runs on the branch head, waiting up to about
60 seconds for GitHub to create them, and approves each one through
`POST /repos/{owner}/{repo}/actions/runs/{run_id}/approve`. The runs then
execute against the PR, so every required check reports, the CodeQL
code-scanning result included. The earlier `workflow_dispatch` approach
satisfied the CI check but never produced the CodeQL result. A GitHub App token
would also work, but it needs a long-lived private key in org secrets; the
approval needs no stored secret.

### Will Renovate keep consumer pins current?

Checked, because a pin nobody bumps is worse than `@main`.

Consumers extend `github>unional/renovate-preset`, which is:

```json
{
  "description": "Preserving Semver",
  "extends": ["config:base", ":preserveSemverRanges"]
}
```

No `enabledManagers`, no `packageRules`, nothing disabling `github-actions`.
`config:base` enables all managers, and Renovate's `github-actions` manager
handles both `steps[].uses` and reusable-workflow `jobs.<id>.uses`. **So yes —
tagged refs will be picked up.** (`:preserveSemverRanges` applies to npm ranges,
not Actions refs. Renovate ignores `@main`, which is why nothing bumps today.)

One consequence worth understanding before it surprises someone: pinned to a
moving `@v1`, Renovate has **nothing to bump** for ordinary releases — `v1` is
still `v1` after `v1.0.1`. You will see no update PRs, and you do not need them,
because the alias moves on its own. Renovate only opens a PR when `v2` appears —
which, here, it should **not** be allowed to merge automatically, because moving
a consumer from `@v1` to `@v2` is only correct alongside a `@changesets/cli`
v2 → v3 upgrade in the same repo.

Dependabot will not help here: `visual-testing` and `storybook` have a
`.github/dependabot.yml` with an `npm` entry only and no `github-actions`
ecosystem. Renovate is doing this job.

Two config problems found while checking, neither blocking:

- `repobuddy/storybook` has **two** Renovate configs — a root `renovate.json`
  (`config:recommended`) and `.github/renovate.json` (the org preset). Root wins
  by Renovate's precedence order and the other is ignored. The github-actions
  manager is enabled either way, so tag bumping still works, but the duplicate
  should be removed.
- `config:base` is a deprecated alias for `config:recommended`; worth updating
  the preset.

### Cutting a release

Manual. This repo is tagged rarely, and a release workflow for that cadence is
scaffolding that needs its own maintenance.

Releases are cut from `main`. Shown here for `v2.3.0`; substitute the next version:

```bash
# 1. From the merge commit you intend to release:
git checkout main && git pull

# 2. Immutable version tag + release notes.
git tag -a v2.3.0 -m "v2.3.0"
git push origin v2.3.0
gh release create v2.3.0 --generate-notes

# 3. Move the major alias forward. -f on both sides is required: the tag
#    already exists and is intentionally being re-pointed.
git tag -f v2 v2.3.0
git push -f origin v2
```

Step 3 is the one that is easy to get wrong or forget. If the alias is not
moved, the release is invisible to everyone pinning it.

#### Internal refs

Workflows in this repo consume this repo's own composite actions,
`setup-playwright` and `setup-node-pnpm`:

```text
        uses: repobuddy/.github/.github/actions/setup-playwright@v2
        uses: repobuddy/.github/.github/actions/setup-node-pnpm@v2
```

A reusable workflow cannot reference a sibling action by relative path — `./`
resolves against the *caller's* checkout, not this repo's — so these must be
fully-qualified `owner/repo/path@ref`. They carry the moving alias of their own
line: `@v2`. That way a consumer pinned at `@v2` gets
the actions from `v2` too, and the refs need no touching on each release.

### Playwright is optional

`setup-playwright` probes whether the consuming repo can actually run Playwright
(`pnpm exec playwright --version`, or the equivalent for the configured package
manager) and skips the cache and install steps when it cannot. Repos with no
browser tests therefore need no configuration.

That probe used to run bare, so it exited 1 and killed the job for any consumer
without Playwright — `verify` died after `pnpm install` and before ever running
`pnpm verify`. Every other repo on these workflows is a visual-testing repo,
which is why it went unnoticed until `repobuddy/jest-watch-toggle-config-2`
adopted them.

`pnpm-verify.yml` also takes `skip-playwright: true` to force-skip the step, and
the Linux virtual display, even when Playwright *is* installed. It is not needed
for the "repo has no Playwright" case, because detection covers that.

## Verify

`pnpm-verify.yml` runs `pnpm <command>` on every leg of an OS × Node matrix and
reports one `all-checks` result. A failing leg does not cancel the others
(`fail-fast: false`), so each broken leg reports its own error.

| Input | Default | Effect |
| --- | --- | --- |
| `os` | `["ubuntu-latest", "macos-latest", "windows-latest"]` | The OS matrix, as JSON. |
| `node-version` | `["lts/-1", "lts/*"]` | The Node.js matrix, as JSON. |
| `pnpm-version` | from `packageManager` | pnpm for every leg. |
| `command` | `verify` | The package script to run. |
| `skip-playwright` | `false` | Skip the Playwright install and the Linux virtual display. |
| `skip-codecov` | `false` | Skip the coverage upload. |
| `codecov-node-version` | `lts/*` | The Node leg, on `ubuntu-latest`, that uploads coverage. |
| `codecov-flags` | none | Passed to codecov-action's `flags`. |

When a leg fails, its snapshot and visual-test diffs (`**/__snapshots__/linux`,
`**/__vis__/**/__diffs__`, `**/__vis__/**/__results__`) are uploaded as an
artifact named `snapshots-<os>-<job index>`.

## Dependency-update changesets

Two reusable workflows decide the changeset for Renovate PRs and keep a bot from
choosing a major release.

| Workflow | Runs on | What it does |
| --- | --- | --- |
| [`dep-changeset.yml`](.github/workflows/dep-changeset.yml) | Renovate PRs | Writes a patch changeset for an in-major runtime update only after the leak checks pass. Anything else fails until a person commits a changeset. |
| [`dep-changeset-release-guard.yml`](.github/workflows/dep-changeset-release-guard.yml) | the Version Packages PR | Fails when a package's major goes up and no person-written changeset asked for it. |

The header of each file explains the rules. In short:

- `dep-changeset:auto` (set by `unional/renovate-preset` on non-major runtime
  updates): the workflow installs and builds the merge base and the head, then
  runs three checks on each affected public package. It writes
  `.changeset/renovate-<PR>.md` at `patch` only if all three pass.
  - The public type surface, read with the TypeScript compiler from the
    published declaration entry points and every file they import, does not
    change.
  - The dependency's `engines.node` floor does not exceed the package's own.
  - The dependency does not add a required peer dependency or narrow a peer
    range.
- `dep-changeset:human` (runtime majors, every `peerDependencies` update), a
  check that trips or cannot run, or a runtime change with no label: the
  workflow writes nothing, comments the findings on the PR, and fails until a
  person commits a changeset naming each affected package. Changesets committed
  by `renovate[bot]` or `github-actions[bot]` do not count.
- `bundled: true`: a lock-file update also gets a patch changeset, after the
  same checks, for every public package.

### Caller

Add the jobs to the workflow that produces the required `all-checks` check, and
list them in its `needs:`. Both pass on PRs they do not apply to.

The `labeled` trigger re-runs that whole workflow when a label changes. If that
costs too much, put the two jobs in a workflow file of their own and require the
`dep-changeset / gate` and `release-guard / guard` checks in the ruleset
instead.

```yaml
on:
  pull_request:
    # `labeled`: Renovate adds its labels just after it opens the PR.
    types: [opened, synchronize, reopened, labeled, unlabeled]

jobs:
  dep-changeset:
    permissions:
      contents: read
      pull-requests: write
    uses: repobuddy/.github/.github/workflows/dep-changeset.yml@v2
    secrets: inherit
    # with:
    #   bundled: true                  # published files inline dependencies
    #   build-command: pnpm build      # emits the .d.ts the type check reads (default)
    #   rebuild-command: pnpm cl build # rebuild committed output on every Renovate PR
    #   rebuild-paths: packages/cyberlegion/dist/cli.mjs

  release-guard:
    permissions:
      contents: read
      pull-requests: read
    uses: repobuddy/.github/.github/workflows/dep-changeset-release-guard.yml@v2
```

#### When `all-checks` comes from `pnpm-verify.yml`

A repo whose required check is the `all-checks` job of `pnpm-verify.yml` cannot
add jobs to that job's `needs:`. Wrap the three calls in a local reusable
workflow, `.github/workflows/code.yml`, that ends in its own `all-checks` job,
and call it from the PR workflow as a job named `code`. The roll-up then reports
as `code / all-checks`, the name the ruleset already requires.
[cyberuni/cyberlegion](https://github.com/cyberuni/cyberlegion/blob/main/.github/workflows/code.yml)
is the reference copy; it calls the `cyberuni/.github` copies of these workflows,
but the shape is the same.

```yaml
# .github/workflows/code.yml
on:
  workflow_call:
    secrets:
      REPOBUDDY_APP_ID:
        required: false
      REPOBUDDY_APP_PRIVATE_KEY:
        required: false

jobs:
  verify:
    uses: repobuddy/.github/.github/workflows/pnpm-verify.yml@v2
  dep-changeset: # as above
  release-guard: # as above

  all-checks:
    needs: [verify, dep-changeset, release-guard]
    if: always()
    runs-on: ubuntu-latest
    steps:
      - env:
          VERIFY: ${{ needs.verify.result }}
          GATE: ${{ needs.dep-changeset.result }}
          GUARD: ${{ needs.release-guard.result }}
        run: |
          [ "$VERIFY" = success ] || exit 1
          [ "$GATE" = success ] || exit 1
          [ "$GUARD" = success ] || [ "$GUARD" = skipped ] || exit 1
```

```yaml
# .github/workflows/pull-request.yml
jobs:
  code: # this job name makes the check `code / all-checks`
    uses: ./.github/workflows/code.yml
    permissions:
      contents: read
      pull-requests: write
    secrets:
      REPOBUDDY_APP_ID: ${{ secrets.REPOBUDDY_APP_ID }}
      REPOBUDDY_APP_PRIVATE_KEY: ${{ secrets.REPOBUDDY_APP_PRIVATE_KEY }}
```

What each result means to the roll-up:

- `dep-changeset` must be `success`. Its `gate` job runs on every event (`if:
  always()`) and passes on PRs it does not apply to, so any other result is a
  real failure.
- `release-guard` is `skipped` on every branch except the Version Packages
  branch, because its only job does not run there. Accept `skipped`, or the
  roll-up fails on every ordinary PR.
- The `REPOBUDDY_APP_*` secrets must reach `dep-changeset.yml` through both levels. Pass
  them by name at each level, as above, or use `secrets: inherit` at both.

Secrets, passed with `secrets: inherit`:

| Secret | Used for |
| --- | --- |
| `REPOBUDDY_APP_ID` | The GitHub App that pushes the changeset. A push made with `GITHUB_TOKEN` would not re-run the required checks. |
| `REPOBUDDY_APP_PRIVATE_KEY` | The same App's private key. |

Without them, the workflow still blocks what it should block, but it fails on
PRs where it would have written a changeset.

Pin the workflows at `@v2`, like every other workflow here. The scripts they run
live in [`.github/scripts/dep-changeset`](.github/scripts/dep-changeset) and are
loaded from the `tools-ref` input, `v2` by default, so a caller on `@v2` runs
released scripts. Run their tests with `npm ci && npm test` in that directory;
`test-scripts.yml` runs them on every PR that touches them.

Known limits:

- A behavior change that shows in neither the types nor the tests passes the
  checks. That relies on the dependency following semver.
- The type check trips on any change to a dependency declaration the public
  types reach, even a new member the package never uses. Those PRs go to a
  person.
- Catalog entries in `pnpm-workspace.yaml` are attributed to the packages that
  use them only in the one-entry-per-line form pnpm and Renovate write.

## Publish gate

`pnpm-publish-gate.yml` packs each publishable package from the working tree and
diffs it against what is already on the registry. It lists the files with the tool
that will publish them: `pnpm pack` when the repo uses pnpm (a `pnpm@` value in the
root `packageManager` field, or a root `pnpm-lock.yaml`), `npm pack` otherwise. The
two pack differently — pnpm copies the workspace root's LICENSE into a package that
has none, npm does not — so listing with the wrong one reports false changes. Call it as a `needs:` of the
release job so it runs immediately before `changeset publish`:

```yaml
publish-gate:
  uses: repobuddy/.github/.github/workflows/pnpm-publish-gate.yml@v2
  permissions:
    contents: read

release:
  uses: repobuddy/.github/.github/workflows/pnpm-release-changeset-oidc.yml@v2
  needs: [code, publish-gate]
```

It **blocks** on files that must never ship (tests, key material, env files, repo
metadata) and on new runtime `dependencies` absent from the published version. It
**reports without blocking** on removed dependencies and ordinary file churn —
failing on those would train maintainers to ignore the gate.

### Acknowledging a new dependency

A new runtime dependency blocks by default, because that is the shape a
compromised release takes. But legitimate releases add dependencies too, so
there is a way to say yes that is not "turn the gate off":
`.github/publish-gate.json`, in the consuming repo.

```json
{
  "acknowledgedDependencies": {
    "eslint-plugin-harmony": {
      "@typescript-eslint/utils": "Replaces @typescript-eslint/experimental-utils, which its own maintainers deprecated and renamed. Same publisher, same role."
    }
  }
}
```

The ack is reviewed in the same pull request that adds the dependency, by the
same people — which is the only place the question can actually be answered.

Deliberately narrow, and it fails closed:

- an ack names **one** dependency of **one** package; wildcards are rejected
- the reason is **required** and must be non-empty. An ack with no reason records
  that somebody wanted the gate quiet, not that anybody judged the dependency safe
- an ack for a dependency that is not the one being added does nothing
- an unparseable or malformed file **blocks the entire run**, rather than
  degrading to permissive
- acknowledged dependencies are printed in the report with their reasons, so an
  ack is visible in the job summary rather than silent

Once the dependency ships it becomes part of the published baseline and no longer
diffs as new, so the ack is inert. The gate lists those as stale and safe to
delete, so the file does not accumulate permanent exemptions.

### The first-party allow-list

The owner's own packages are a second way through. A new dependency on one of
`FIRST_PARTY` in `.github/scripts/publish-gate.mjs` (`@unional/*`, `@repobuddy/*`,
`type-plus`, `unpartial`, `global-store`, ...) is a move within the owner's own
graph, not a supply-chain surprise. The gate reports it under its own heading and
does not block.

Callers extend the list with the `allowed-new-dependencies` input: exact package
names or `@scope/*` patterns, one per line or comma-separated. Any other wildcard
blocks the run rather than widening the gate silently.

```yaml
publish-gate:
  uses: repobuddy/.github/.github/workflows/pnpm-publish-gate.yml@v2
  with:
    allowed-new-dependencies: '@acme/*, zod'
```

Prefer an ack for a single dependency: it carries a reason and goes stale on its own.
The input suits a family of packages the repo keeps depending on.

There is no input to disable the gate. If you need to publish something the gate
refuses, fix the package, acknowledge the specific dependency, or add it to the
allow-list. Each of those leaves a record in a reviewed file.
