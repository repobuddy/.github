// Run with `node --test .github/scripts/publish-gate.test.mjs`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { packCommand, parsePackFiles, usesPnpm } from './publish-gate.mjs'

function repo(files) {
	const dir = mkdtempSync(join(tmpdir(), 'pg-test-'))
	for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content)
	return dir
}

test('a root pnpm-lock.yaml selects pnpm', () => {
	const root = repo({ 'package.json': '{"name":"x"}', 'pnpm-lock.yaml': "lockfileVersion: '9.0'\n" })
	assert.equal(usesPnpm(root), true)
	assert.equal(packCommand(root).cmd, 'pnpm')
})

test('a root packageManager of pnpm selects pnpm', () => {
	const root = repo({ 'package.json': '{"name":"x","packageManager":"pnpm@12.16.1"}' })
	assert.equal(usesPnpm(root), true)
	assert.equal(packCommand(root).cmd, 'pnpm')
})

test('npm stays the packer where pnpm is absent', () => {
	for (const files of [{ 'package.json': '{"name":"x"}' }, { 'package.json': '{"name":"x","packageManager":"yarn@4.0.0"}', 'yarn.lock': '' }, {}]) {
		const root = repo(files)
		assert.equal(usesPnpm(root), false)
		assert.equal(packCommand(root).cmd, 'npm')
	}
})

test('both packers skip lifecycle scripts', () => {
	assert.deepEqual(packCommand(repo({ 'pnpm-lock.yaml': '' })).args, ['pack', '--dry-run', '--json', '--config.ignore-scripts=true'])
	assert.deepEqual(packCommand(repo({})).args, ['pack', '--dry-run', '--json', '--ignore-scripts'])
})

// pnpm 10.26 through 11.x reject a bare `--ignore-scripts` on `pack`, so the gate
// must never pass it to pnpm.
test('pnpm is never given the bare --ignore-scripts flag', () => {
	assert.equal(packCommand(repo({ 'pnpm-lock.yaml': '' })).args.includes('--ignore-scripts'), false)
})

test('pnpm output: one entry with its files read directly', () => {
	const out = JSON.stringify({ name: 'buddy-agent-harness', version: '0.22.0', filename: 'buddy-agent-harness-0.22.0.tgz', files: [{ path: 'package.json' }, { path: 'LICENSE' }, { path: 'dist/index.mjs' }] }, null, 2)
	assert.deepEqual(parsePackFiles(out, 'pnpm'), ['LICENSE', 'dist/index.mjs', 'package.json'])
})

test('npm output: an array of entries', () => {
	const out = JSON.stringify([{ name: 'x', version: '1.0.0', files: [{ path: 'index.js' }, { path: 'README.md' }] }])
	assert.deepEqual(parsePackFiles(out), ['README.md', 'index.js'])
})

test('npm output: an object keyed by package name', () => {
	const out = JSON.stringify({ x: { name: 'x', version: '1.0.0', files: [{ path: 'index.js' }] } })
	assert.deepEqual(parsePackFiles(out), ['index.js'])
})

test('notices before the JSON are skipped', () => {
	assert.deepEqual(parsePackFiles(`npm notice something\n${JSON.stringify([{ files: [{ path: 'a.js' }] }])}`), ['a.js'])
})

test('output with no file list fails instead of reading as zero files', () => {
	assert.throws(() => parsePackFiles('pinst disabled'), /npm pack produced no JSON/)
	assert.throws(() => parsePackFiles('{"name":"x","version":"1.0.0"}', 'pnpm'), /could not read file list from pnpm pack/)
})
