# Changesets for Renovate PRs: conclusion

## Last updated

November 2026

## Question

What should add a changeset to Renovate dependency PRs in unional and cyberuni repos that use changesets?

- (A) A community action or a Renovate feature.
- (B) The in-house reusable workflow `cyberuni/.github/.github/workflows/dep-changeset.yml`.
- (C) The logic moved into the `repobuddy` GitHub App.

## Verdict

**Keep B and roll it out. No community option replaces it. C is not a separate option. Watch [renovate#47385](https://github.com/renovatebot/renovate/pull/47385).**

- **A writes the file, but it does not gate.** Every working tool writes a fixed `patch` (E1–E4). None checks whether the update leaks into the package's type surface, raises its `engines.node` floor, or changes its peers. None fails the PR when a person has to decide. B does all of this (E8).
- **A is less safe than B as people run it.** Backstage, Scaleway, mscharley and Staffline check out the PR head and install it under `pull_request_target`, with write access and secrets (E1, E3, E6). B runs the PR's code with a read-only token and no secrets, and mints its app token only after install and build have finished (E8).
- **A needs a PAT, or loses CI.** A push made with `GITHUB_TOKEN` starts no new runs (E10), so these tools either push with a PAT or skip CI on the commit that adds the changeset. B already pushes with the AUTOFIX app token.
- **Renovate's own route is closed on the hosted app today.** `postUpgradeTasks`, which `psirenny/renovate-changesets` needs, runs only allowlisted commands. Free hosted users cannot add to that list (E5).
- **[renovate#47385](https://github.com/renovatebot/renovate/pull/47385) is the one to watch.** It adds a native `postUpdateOptions: ["changesets"]`, so it would not need a command allowlist. The changeset would land in Renovate's own commit, with no extra push and no token (E6).
  - Its bump rule: `major` when a peer range narrows or a peer is added, otherwise `patch`.
  - It has no type-surface or `engines` check.
  - If it merges, it could replace B's `write` job for updates within a major. B's `inspect` and `gate` jobs, and the release guard, would still be needed.
  - It is open, needs review, and the CLA is unsigned (E6).
- **C is the same workflow under another trigger.** The app's own design keeps the work in Actions and makes the app a router ([github-app#40](https://github.com/repobuddy/github-app/issues/40), E9).
  - Moving `dep-changeset` into it buys only a different commit identity. [app-token-distribution.md](https://github.com/repobuddy/github-app/blob/main/docs/research/app-token-distribution.md) already settles that question.
  - Its plan uses a separate CI app now, and GitHub's keyless app tokens when they ship.
  - The cost is a hosted service and a key to hold.

### Comparison

| | A: community action | A: Renovate `postUpgradeTasks` | A: renovate#47385 | B: `dep-changeset.yml` | C: repobuddy app |
| --- | --- | --- | --- | --- | --- |
| Available | Yes | Self-hosted Renovate, or a paid Mend plan | Not merged | Yes | Not built |
| Bump level | Fixed patch. mscharley maps from the commit type. | Fixed patch | Patch, or major on a peer change | Patch only after the leak checks pass. Anything else goes to a person. | Same as B |
| Fails closed | No | No | No | Yes: a missing label, a failed check, or a failed build blocks the PR | Same as B |
| Private packages, devDeps | Varies by tool. Guild and Scaleway skip both. | Honors changesets `ignore` and `privatePackages` | Skips private and ignored | Public workspace packages only. Runtime fields only. | Same as B |
| Re-triggers CI | Only with a PAT | Yes. It is Renovate's own commit. | Yes | Yes, through the app token | Yes, through the app token |
| Secrets exposed to PR code | Usually, under `pull_request_target` | None in GitHub | None in GitHub | None. The app token is minted after the build. | Depends on the router |
| Ops burden | Low, plus a PAT per org | Run Renovate yourself | None | One caller job per repo, plus the AUTOFIX secrets | A service, a key, and installs |

### Changes this implies (for the user to decide)

- **`cyberuni/path-equal`**
  - Delete the local `packageRules`. The blanket `automerge: false` on majors overrides the preset's finer rules: dev-dependency majors after 7 days, and GitHub Actions majors. That is the blocking the user saw.
  - Remove the local `description`. It says the preset has no automerge policy, which is no longer true.
  - The local `minimumReleaseAge: "1 day"` overrides the preset's 3 days. Keep it only if that is intended.
  - `pull-request.yml` calls neither `dep-changeset.yml` nor the release guard. The published `path-equal` package has no runtime dependencies, so the gate would pass every PR today. The guard still protects the release.
- **`unional/renovate-preset`**
  - The labels cover only `dependencies` and `peerDependencies`. B also reads `optionalDependencies` and pnpm catalog entries. An unlabeled runtime change from either fails closed in B, so a person gets asked when no one needed to be.
  - Fix: label `optionalDependencies` the same way, and the catalog dep types too. Verify the catalog dep-type names (`pnpm.catalog.*`) against the Renovate docs first.
  - Runtime majors of private apps such as `apps/website` wait for dashboard approval. That is noise, not risk. Only a per-repo rule can remove it.

## Confidence

High that no community tool matches B. Medium on renovate#47385's future.

## Strongest supporting evidence

- E1–E4: the tools' own source writes a fixed `patch`, with no surface check.
- E5: the Mend hosted-app docs on the command allowlist.
- E8: the dep-changeset workflow and `lib.mjs`.

## Strongest weakening evidence

- E6: renovate#47385. If it merges, it covers the common case with no workflow at all.
- Most of the ecosystem accepts a fixed patch, which suggests B's leak checks guard against something rare.

## Not supported

- The claim that the-guild's action does "smart semver inference". The source shows only `patch`.

## Where evidence is thin

- Whether a `GITHUB_TOKEN` push to an existing PR branch now starts runs in an approval-required state. The newer text in GitHub's docs is ambiguous (E10).
- How Astro, Vite and pnpm handle this. Nothing was found in their `.github` folders.

## Check again later

- renovate#47385: merged, and does it reach the hosted app?
- GitHub's keyless app tokens in Actions. They would remove the AUTOFIX secrets from B.
- mscharley/dependency-changesets-action. It is the only active action with a configurable bump.
