# .github

Organization setting repository.

[Default Community Health Files](https://docs.github.com/en/github/building-a-strong-community/creating-a-default-community-health-file)

[Starter Workflows](https://docs.github.com/en/actions/learn-github-actions/creating-starter-workflows-for-your-organization)

Use the workflow templates to create workflows for each repository.

References:

- <https://github.blog/changelog/2020-04-15-github-actions-new-workflow-features/>

## Versioning

### Which ref to pin

**Pin `@v1`.**

```yaml
jobs:
  verify:
    uses: repobuddy/.github/.github/workflows/pnpm-verify.yml@v1
```

`v1` is a *moving* tag. It is re-pointed forward on every backward-compatible
release, so you get fixes without doing anything. It is never moved across a
breaking change — that is what `v2` would be for.

If you need a ref that never moves under you, pin the exact version instead
(`@v1.0.0`) and accept that you must bump it by hand to get any fix.

Do **not** pin `@main`. `main` is the development branch: it carries unreleased
and possibly broken work, and every consumer on it takes every change the
instant it merges. That is how a silently-broken release path reached three
repos ([#43](https://github.com/repobuddy/.github/issues/43)).

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
renamed inputs, arrived as Renovate PR
[#42](https://github.com/repobuddy/.github/pull/42) on branch
`renovate/changesets-action-2.x` and was auto-merged. The Mergify rule intends
to hold majors back with `head~=^(?!major-)`, but Renovate does not prefix these
branches with `major-`, so the guard did not match and the major merged like any
patch. The result was [#43](https://github.com/repobuddy/.github/issues/43): a
release path that silently stopped publishing, in three repos at once.

Tagging fixes the consumer half of this — an auto-merged bump now lands on
`main` and waits there until someone cuts a release. The Mergify rule not
actually excluding majors is a separate defect and should be fixed on its own.

### Starting version: `v1.0.0`

Not `v0.x`. Two reasons:

1. These workflows are already in production use by three repos and have been
   for a long time. `v0.x` would advertise "expect this to break", which is a
   less honest description of the status quo than `v1` — and `@main` offered no
   stability guarantee whatsoever, so anything we tag is an improvement rather
   than a regression in stability.
2. The moving-major-alias convention is only coherent at `>= 1`. Under semver,
   `0.x` minor bumps are permitted to break, so a moving `v0` alias would carry
   breaking changes to every consumer automatically — precisely the failure mode
   this change exists to stop.

### What one version covers

**Everything in this repo shares one tag** — all eight reusable workflows plus
the `setup-playwright` composite action. They live in one repo, and a git tag
names a commit of the whole repo; there is no per-workflow versioning.

The consequence, stated plainly: **a change to any one workflow bumps the tag
for all consumers of all of them.** A repo that only uses `pnpm-verify.yml`
will still see version churn from an edit to `pnpm-release-semantic.yml`.
That churn is noise, not risk — the unchanged workflows are byte-identical
across the two tags.

If that churn ever becomes a real problem, the escape hatch is per-workflow tag
prefixes (`pnpm-verify/v1`). Do not reach for it pre-emptively; it multiplies
the release procedure by eight.

### What counts as breaking

A major bump is required when a change would break a consumer that changed
nothing on its side:

- removing or renaming a workflow, an action, or one of their inputs
- making a previously optional input required
- changing a default such that existing behavior changes
- requiring a secret that consumers did not previously have to set
- **requiring a new precondition in the consumer's own repo**

That last one is easy to miss and is live right now: the `pnpm-release-changeset.yml`
workflow uses `changesets/action@v2`, which **validates that the consumer is on
`@changesets/cli` v3 and fails for v2 users.** So `v1`'s contract includes
"consumers of `pnpm-release-changeset.yml` must be on `@changesets/cli` v3".

As of 2026-08-12 **all four consumers are still on `@changesets/cli` v2**
(`repobuddy` `^2.26.0`, `storybook` `^2.29.7`, `visual-testing` `^2.29.8`,
`jest-watch-toggle-config-2` `^2.25.2`). None of them can adopt this workflow at
`v1` until it upgrades. They are not losing anything by waiting — `main` already
carries `changesets/action@v2`, so their release path is already mismatched
today; pinning a tag does not create that problem, it just stops the next one.

### Will Renovate keep consumer pins current?

Checked, because a pin nobody bumps is worse than `@main`.

All four consumers extend `github>unional/renovate-preset`, which is:

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

One consequence worth understanding before it surprises someone: pinned to the
moving `@v1`, Renovate has **nothing to bump** for ordinary releases — `v1` is
still `v1` after `v1.0.1`. You will see no update PRs, and you do not need them,
because the alias moves on its own. Renovate only opens a PR when `v2` appears,
which is exactly the moment a human should be looking. Repos that pin exact
(`@v1.0.0`) get a PR per release instead.

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
scaffolding that needs its own maintenance. Two commands and a force-move:

```bash
# 1. From the merge commit on main that you intend to release:
git checkout main && git pull

# 2. Immutable version tag + release notes.
git tag -a v1.0.0 -m "v1.0.0"
git push origin v1.0.0
gh release create v1.0.0 --generate-notes

# 3. Move the major alias forward. -f on both sides is required: the tag
#    already exists and is intentionally being re-pointed.
git tag -f v1 v1.0.0
git push -f origin v1
```

Step 3 is the one that is easy to get wrong or forget. If `v1` is not moved, the
release is invisible to everyone pinning `@v1`.

#### Known gap: internal refs still float on `@main`

Two workflows in this repo consume this repo's own composite action:

```text
.github/workflows/pnpm-verify.yml:43
.github/workflows/pnpm-release-changeset.yml:42
        uses: repobuddy/.github/.github/actions/setup-playwright@main
```

A reusable workflow cannot reference a sibling action by relative path — `./`
resolves against the *caller's* checkout, not this repo's — so these must be
fully-qualified `owner/repo/path@ref`, and today that ref is `@main`. **A
consumer pinned at `@v1` therefore still picks up `setup-playwright` from
`main`,** which partially defeats the pin.

This is deliberately not fixed in the same change that introduces the scheme:
re-pointing them to `@v1` before `v1` exists would break every current consumer
immediately. Once `v1.0.0` is cut, change both lines to `@v1` — the moving
alias, so they do not need touching on every subsequent release — and include
that edit in the release. Until then, treat it as a known hole.
