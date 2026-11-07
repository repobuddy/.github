// Publish gate: compares what a release PR is about to publish against what is
// currently on the registry, and fails on the differences that are almost always
// a mistake or an attack.
//
// Runs against the "Version Packages" PR, which is the only point where the exact
// contents of the next release are knowable and still reviewable.
//
// The file list comes from the repo's own packer: `pnpm pack` in a pnpm repo,
// `npm pack` otherwise. See `usesPnpm` for why.
//
// A new runtime dependency blocks by default. That is the right default — it is the
// shape a compromised release takes — but a legitimate release adds dependencies too,
// so there has to be a way to say yes that is not "turn the gate off". That is
// `.github/publish-gate.json` in the consuming repo: it names the package, the exact
// dependency, and a written reason. The ack is reviewed in the same PR that adds the
// dependency, by the same people, which is the only place the question can actually
// be answered.
//
// It is deliberately narrow. An ack covers one dependency of one package, never a
// wildcard and never "skip the gate". An ack with no reason is not an ack, and an
// unparseable config blocks rather than degrading to permissive.
import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Files that have no business in a published tarball. Precedent: color-map shipped
// compiled .spec.js files in its 2.1.0 tarball without anyone noticing.
const RISKY = [
	{ re: /(^|\/)[^/]*\.(test|spec)\.[cm]?[jt]sx?$/i, why: 'test file' },
	{ re: /(^|\/)\.env(\.|$)/i, why: 'env file' },
	{ re: /\.(pem|key|p12|pfx|ppk)$/i, why: 'key material' },
	{ re: /(^|\/)\.npmrc$/i, why: 'npmrc (may carry a token)' },
	{ re: /(^|\/)\.git(hub|ignore|attributes)?\//i, why: 'repo metadata' },
	{ re: /(^|\/)id_(rsa|ed25519)/i, why: 'ssh key' },
]

// Reads the acknowledgement file. Returns a map of package name -> { dep: reason }.
//
// Every failure mode here throws rather than returning empty. A typo in this file must
// not silently restore the "everything blocks" behaviour *or* silently widen it — the
// maintainer needs to be told the file is wrong, and the release needs to stop until
// it is fixed.
export function loadAcks(root) {
	const f = join(root, '.github', 'publish-gate.json')
	if (!existsSync(f)) return {}

	let raw
	try {
		raw = JSON.parse(readFileSync(f, 'utf8'))
	} catch (err) {
		throw new Error(`.github/publish-gate.json is not valid JSON: ${err.message}`)
	}

	const acks = raw.acknowledgedDependencies ?? {}
	if (typeof acks !== 'object' || acks === null || Array.isArray(acks)) {
		throw new Error('.github/publish-gate.json: `acknowledgedDependencies` must be an object keyed by package name')
	}

	for (const [pkgName, entry] of Object.entries(acks)) {
		if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
			throw new Error(`.github/publish-gate.json: \`${pkgName}\` must map dependency names to a reason`)
		}
		for (const [dep, reason] of Object.entries(entry)) {
			// A reason is the whole point. An ack without one records that somebody wanted
			// the gate quiet, not that anybody decided the dependency was safe.
			if (typeof reason !== 'string' || !reason.trim()) {
				throw new Error(`.github/publish-gate.json: \`${pkgName}\` -> \`${dep}\` needs a non-empty reason`)
			}
			if (dep.includes('*')) {
				throw new Error(`.github/publish-gate.json: \`${pkgName}\` -> \`${dep}\` must name one dependency exactly; wildcards are not accepted`)
			}
		}
	}

	return acks
}

function sh(cmd, args, opts = {}) {
	return execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts })
}

// The repo publishes through its own package manager, and pnpm and npm pack
// differently. pnpm copies the workspace root's LICENSE into a package that has
// none of its own; npm does not. Listing a pnpm package with npm made every
// release report "LICENSE removed", noise that hides any other difference.
//
// pnpm is detected the way the repo declares it: a root `packageManager` of
// `pnpm@...`, or a root `pnpm-lock.yaml`. Anything else keeps npm.
export function usesPnpm(root) {
	if (existsSync(join(root, 'pnpm-lock.yaml'))) return true
	try {
		const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
		return typeof pkg.packageManager === 'string' && pkg.packageManager.startsWith('pnpm@')
	} catch {
		return false
	}
}

// `pack --dry-run --json` reports the exact file list the tool would publish,
// honouring `files`, .npmignore and all the built-in rules. Reimplementing that
// resolution would be its own source of bugs.
//
// `--ignore-scripts` because a lifecycle script's own stdout lands in the same
// stream as the JSON: these repos run `prepack: pinst --disable`, whose "pinst
// disabled" line made JSON.parse throw and the whole package report as
// "inspection failed", and pnpm without it runs a package's `prepack` rebuild
// and prints the build log there. The gate is an inspection — it should not be
// running the package's scripts at all, and the caller workflow already builds
// beforehand.
//
// pnpm takes it as `--config.ignore-scripts=true`, not `--ignore-scripts`. pnpm 12
// accepts the bare flag on `pack`, but pnpm 10.26 through 11.x reject it with
// "Unknown option: 'ignore-scripts'", the pack fails, and the gate blocks every
// release in those repos. The `--config.` form sets the same setting and is accepted
// by every pnpm that has `pack --dry-run` (10.26 onward). pnpm before 10.26 has no
// `pack --dry-run` at all, so the gate cannot serve it either way.
export function packCommand(root) {
	return usesPnpm(root)
		? { cmd: 'pnpm', args: ['pack', '--dry-run', '--json', '--config.ignore-scripts=true'] }
		: { cmd: 'npm', args: ['pack', '--dry-run', '--json', '--ignore-scripts'] }
}

export function parsePackFiles(out, cmd = 'npm') {
	// npm also emits notices on stdout in some versions, so slice from the first
	// structural character rather than trusting the whole stream to be JSON.
	const start = out.search(/[[{]/)
	if (start < 0) throw new Error(`${cmd} pack produced no JSON`)
	const parsed = JSON.parse(out.slice(start))
	// Three shapes: npm's array of entries, npm's object keyed by package name,
	// and pnpm's single entry `{ name, version, filename, files }`. Accept each —
	// guessing wrong makes the gate silently report zero files, which reads as
	// "clean".
	const entry = Array.isArray(parsed) ? parsed[0] : Array.isArray(parsed?.files) ? parsed : Object.values(parsed ?? {})[0]
	const files = entry?.files
	if (!Array.isArray(files)) throw new Error(`could not read file list from ${cmd} pack`)
	return files.map((f) => f.path).sort()
}

function localPack(dir, root) {
	const { cmd, args } = packCommand(root)
	const out = sh(cmd, args, { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] })
	try {
		return parsePackFiles(out, cmd)
	} catch (err) {
		throw new Error(`${err.message} in ${dir}`)
	}
}

function publishedInfo(name) {
	try {
		const out = sh('npm', ['view', `${name}@latest`, '--json'], { stdio: ['ignore', 'pipe', 'ignore'] })
		const parsed = JSON.parse(out)
		// `npm view` wraps in an array when the spec matches more than one version.
		const j = Array.isArray(parsed) ? parsed[parsed.length - 1] : parsed
		if (!j?.dist?.tarball) throw new Error(`no tarball for ${name}`)
		return { version: j.version, tarball: j.dist.tarball, dependencies: j.dependencies ?? {} }
	} catch {
		return null // never published
	}
}

function publishedFiles(tarball) {
	const dir = mkdtempSync(join(tmpdir(), 'pg-'))
	const tgz = join(dir, 'p.tgz')
	sh('curl', ['-sSL', '-o', tgz, tarball])
	const listing = sh('tar', ['-tzf', tgz])
	return listing
		.split('\n')
		.filter(Boolean)
		.map((p) => p.replace(/^package\//, ''))
		.filter((p) => !p.endsWith('/'))
		.sort()
}

function diff(before, after) {
	const b = new Set(before)
	const a = new Set(after)
	return {
		added: after.filter((x) => !b.has(x)),
		removed: before.filter((x) => !a.has(x)),
	}
}

// `root` is the repo being inspected; it decides which package manager lists the
// files. It comes after `acks` here because this copy's second parameter was
// already the acknowledgement map.
export function gatePackage(dir, acks = {}, root = process.cwd()) {
	const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
	if (pkg.private || !pkg.name) return null

	const files = localPack(dir, root)
	const deps = pkg.dependencies ?? {}
	const pub = publishedInfo(pkg.name)

	const risky = files.flatMap((f) => {
		const hit = RISKY.find((r) => r.re.test(f))
		return hit ? [{ file: f, why: hit.why }] : []
	})

	let fileDiff = null
	let depDiff = null
	if (pub?.tarball) {
		fileDiff = diff(publishedFiles(pub.tarball), files)
		depDiff = diff(Object.keys(pub.dependencies), Object.keys(deps))
	}

	// Split the added deps by whether this repo has already answered for them. Both
	// halves are reported; only the unacknowledged half blocks.
	const pkgAcks = acks[pkg.name] ?? {}
	const acknowledged = (depDiff?.added ?? []).filter((d) => pkgAcks[d]).map((d) => ({ dep: d, reason: pkgAcks[d] }))
	if (depDiff) depDiff = { ...depDiff, added: depDiff.added.filter((d) => !pkgAcks[d]) }

	// An ack for a dependency that is not newly added has done its job and outlived it:
	// once the dep ships, it is in the published baseline and no longer diffs as added.
	// Report it so the file gets pruned instead of accumulating permanent exemptions.
	const staleAcks = Object.keys(pkgAcks).filter((d) => !(depDiff?.added ?? []).includes(d) && !acknowledged.some((a) => a.dep === d))

	return { name: pkg.name, version: pkg.version, publishedVersion: pub?.version ?? null, files, risky, fileDiff, depDiff, deps, acknowledged, staleAcks }
}

export function render(results) {
	const lines = []
	let failed = false

	for (const r of results) {
		lines.push(`### \`${r.name}\` — ${r.publishedVersion ?? '(unpublished)'} → ${r.version}`, '')

		if (r.risky.length) {
			failed = true
			lines.push('**Blocked — files that must not ship:**', '')
			for (const x of r.risky) lines.push(`- \`${x.file}\` — ${x.why}`)
			lines.push('')
		}

		if (r.depDiff?.added.length) {
			failed = true
			lines.push('**Blocked — new runtime dependencies:**', '')
			for (const d of r.depDiff.added) lines.push(`- \`${d}\`@\`${r.deps[d]}\``)
			lines.push('')
		}

		if (r.acknowledged?.length) {
			lines.push('**New runtime dependencies, acknowledged in `.github/publish-gate.json`:**', '')
			for (const a of r.acknowledged) lines.push(`- \`${a.dep}\`@\`${r.deps[a.dep]}\` — ${a.reason}`)
			lines.push('')
		}

		if (r.staleAcks?.length) lines.push(`Stale acknowledgements (dependency no longer new, safe to delete): ${r.staleAcks.map((d) => `\`${d}\``).join(', ')}`, '')

		if (r.depDiff?.removed.length) lines.push(`Runtime deps removed: ${r.depDiff.removed.map((d) => `\`${d}\``).join(', ')}`, '')

		if (r.fileDiff) {
			const { added, removed } = r.fileDiff
			if (!added.length && !removed.length) lines.push('Tarball contents unchanged.', '')
			else {
				if (added.length) lines.push(`<details><summary>${added.length} file(s) added to the tarball</summary>`, '', ...added.map((f) => `- \`${f}\``), '', '</details>', '')
				if (removed.length) lines.push(`<details><summary>${removed.length} file(s) removed</summary>`, '', ...removed.map((f) => `- \`${f}\``), '', '</details>', '')
			}
		} else {
			lines.push(`First publish — ${r.files.length} file(s), no baseline to diff.`, '')
		}
	}

	lines.push(failed ? '**Result: blocked.**' : '**Result: clean.**')
	return { body: lines.join('\n'), failed }
}
