#!/usr/bin/env node
// Checks that the `repobuddy` GitHub App is installed on all repositories of every
// org the current `gh` user administers (repobuddy/.github#84).
//
// Read-only: it only calls GET endpoints through the caller's `gh` token. It installs
// nothing and changes no settings. Installing an app needs the org owner in the UI.
//
// Usage: node .github/scripts/check-app-installs.mjs [app-slug]
//
// One row per active admin org from `user/memberships/orgs`. An org whose
// `orgs/<org>/installations` returns 403 or 404 is reported as "cannot check", not as
// missing: the token cannot see its installations, so absence is not established.
// The personal account install (`users/<login>/installation`) needs an app JWT, so it
// is not queried.
//
// Exits 1 when any org is missing the app, is not `repository_selection: all`, or has
// permissions or events that deviate from the expected set. "cannot check" alone does
// not fail the run, but is counted in the summary.
import { execFileSync } from 'node:child_process'

const APP_SLUG = process.argv[2] ?? 'repobuddy'
const EXPECTED_PERMISSIONS = { contents: 'write', metadata: 'read' }
const EXPECTED_EVENTS = []

function gh(args) {
	return execFileSync('gh', ['api', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

// `gh api --paginate --slurp` returns an array of pages, whatever each page's shape.
function ghPages(path) {
	return JSON.parse(gh(['--paginate', '--slurp', path]))
}

function httpStatus(err) {
	const m = /\(HTTP (\d{3})\)/.exec(String(err.stderr ?? err.message))
	return m ? Number(m[1]) : undefined
}

function diffPermissions(actual) {
	const out = []
	for (const [k, v] of Object.entries(EXPECTED_PERMISSIONS)) {
		if (actual[k] !== v) out.push(`${k}: ${actual[k] ?? '(none)'} (want ${v})`)
	}
	for (const [k, v] of Object.entries(actual)) {
		if (!(k in EXPECTED_PERMISSIONS)) out.push(`${k}: ${v} (unexpected)`)
	}
	return out
}

function diffEvents(actual) {
	const extra = actual.filter((e) => !EXPECTED_EVENTS.includes(e)).map((e) => `+${e}`)
	const missing = EXPECTED_EVENTS.filter((e) => !actual.includes(e)).map((e) => `-${e}`)
	return [...extra, ...missing]
}

function checkOrg(org) {
	let pages
	try {
		pages = ghPages(`orgs/${org}/installations`)
	} catch (err) {
		const status = httpStatus(err)
		if (status === 403 || status === 404) return { org, status: 'cannot check', detail: `HTTP ${status}` }
		throw err
	}
	const inst = pages.flatMap((p) => p.installations ?? []).find((i) => i.app_slug === APP_SLUG)
	if (!inst) return { org, status: 'missing', detail: '' }

	const problems = []
	if (inst.repository_selection !== 'all') problems.push(`repository_selection: ${inst.repository_selection}`)
	const perms = diffPermissions(inst.permissions ?? {})
	if (perms.length) problems.push(`permissions: ${perms.join(', ')}`)
	const events = diffEvents(inst.events ?? [])
	if (events.length) problems.push(`events: ${events.join(' ')}`)
	if (inst.suspended_at) problems.push(`suspended_at: ${inst.suspended_at}`)

	return {
		org,
		status: problems.length ? 'deviates' : 'ok',
		selection: inst.repository_selection,
		permsOk: perms.length === 0,
		eventsOk: events.length === 0,
		detail: problems.join('; '),
	}
}

const login = JSON.parse(gh(['user'])).login
const orgs = ghPages('user/memberships/orgs')
	.flat()
	.filter((m) => m.state === 'active' && m.role === 'admin')
	.map((m) => m.organization.login)
	.sort((a, b) => a.localeCompare(b))

const results = orgs.map(checkOrg)

const yn = (b) => (b === undefined ? '-' : b ? 'yes' : 'NO')
const header = ['org', 'status', 'repository_selection', 'permissions ok', 'events ok', 'detail']
const rows = results.map((r) => [r.org, r.status, r.selection ?? '-', yn(r.permsOk), yn(r.eventsOk), r.detail || '-'])
const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)))
const line = (cells) => cells.map((c, i) => c.padEnd(widths[i])).join('  ').trimEnd()

console.log(`App: ${APP_SLUG}. Expected: repository_selection all, permissions ${JSON.stringify(EXPECTED_PERMISSIONS)}, events ${JSON.stringify(EXPECTED_EVENTS)}.`)
console.log(`Orgs where ${login} is an active admin: ${orgs.length}.`)
console.log('')
console.log(line(header))
console.log(line(widths.map((w) => '-'.repeat(w))))
for (const r of rows) console.log(line(r))
console.log('')

const count = (s) => results.filter((r) => r.status === s).length
const ok = count('ok')
const missing = count('missing')
const deviates = count('deviates')
const unknown = count('cannot check')
console.log(`Summary: ${ok} ok, ${missing} missing, ${deviates} deviate, ${unknown} cannot check (of ${results.length}).`)
console.log(`Not checked: the ${login} user account install. users/${login}/installation needs an app JWT, which this script does not hold.`)

process.exitCode = missing + deviates > 0 ? 1 : 0
