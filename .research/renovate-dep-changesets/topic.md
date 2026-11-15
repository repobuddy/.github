# Changesets for Renovate PRs (November 2026)

## Question

What should add changesets to Renovate dependency PRs in unional and cyberuni repos: a community tool (A), the in-house `dep-changeset.yml` (B), or the repobuddy GitHub App (C)?

## Scope

In scope:

- Changeset writers for Renovate and Dependabot.
- Renovate's native features.
- GitHub token and trigger rules.
- The current preset and `path-equal`.

Out of scope: building or changing anything.

## Source angles

- The tools' own code and READMEs. See evidence E1–E4.
- Renovate docs and its issue tracker (E5, E6).
- How other projects do it: Backstage (E7).
- The in-house code and design docs (E8, E9, E11).
- GitHub platform docs (E10).

## Findings

See the verdict in conclusion.md. One pattern stands out: every tool in production use writes a fixed `patch`. None gates the PR on whether the update changes the package's public surface.

## Contradictions

- the-guild's README claims "smart semver inference". Its source shows only `patch` (E2).

## Open questions

- Will renovate#47385 merge, and will the hosted app enable it?
- What are the exact Renovate dep-type names for pnpm catalogs, for the preset labels?

## Sources consulted

See evidence.md.
