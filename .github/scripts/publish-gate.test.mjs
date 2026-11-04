// Run with `node --test .github/scripts/publish-gate.test.mjs`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { detectPackManager, packCommand, parsePackOutput } from './publish-gate.mjs'

function repo(files) {
	const dir = mkdtempSync(join(tmpdir(), 'pg-test-'))
	for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content)
	return dir
}

test('pnpm pack output: one object with a files list', () => {
	const out = JSON.stringify({
		name: 'buddy-agent-harness',
		version: '0.22.0',
		filename: 'buddy-agent-harness-0.22.0.tgz',
		files: [{ path: 'package.json' }, { path: 'LICENSE' }, { path: 'dist/index.mjs' }],
	})
	assert.deepEqual(parsePackOutput(out), ['LICENSE', 'dist/index.mjs', 'package.json'])
})

test('npm pack output: an array of entries', () => {
	const out = JSON.stringify([{ name: 'x', files: [{ path: 'index.js' }, { path: 'package.json' }] }])
	assert.deepEqual(parsePackOutput(out), ['index.js', 'package.json'])
})

test('npm pack output: an object keyed by package name', () => {
	const out = JSON.stringify({ x: { name: 'x', files: [{ path: 'index.js' }] } })
	assert.deepEqual(parsePackOutput(out), ['index.js'])
})

test('notices before the JSON are skipped', () => {
	const out = `npm notice something\n${JSON.stringify([{ files: [{ path: 'a.js' }] }])}`
	assert.deepEqual(parsePackOutput(out), ['a.js'])
})

test('output without a file list throws instead of reporting zero files', () => {
	assert.throws(() => parsePackOutput('no json here'), /produced no JSON/)
	assert.throws(() => parsePackOutput(JSON.stringify({ name: 'x', version: '1.0.0' })), /could not read file list/)
})

test('pnpm is detected from the packageManager field', () => {
	assert.equal(detectPackManager(repo({ 'package.json': JSON.stringify({ packageManager: 'pnpm@12.16.1' }) })), 'pnpm')
})

test('pnpm is detected from a root pnpm-lock.yaml', () => {
	assert.equal(detectPackManager(repo({ 'package.json': '{}', 'pnpm-lock.yaml': "lockfileVersion: '9.0'\n" })), 'pnpm')
})

test('npm is used where pnpm is absent', () => {
	assert.equal(detectPackManager(repo({ 'package.json': JSON.stringify({ packageManager: 'npm@11.0.0' }) })), 'npm')
	assert.equal(detectPackManager(repo({ 'package.json': '{}', 'package-lock.json': '{}' })), 'npm')
	assert.equal(detectPackManager(repo({})), 'npm')
})

test('the pack command follows the package manager and never runs scripts', () => {
	assert.deepEqual(packCommand('pnpm'), ['pnpm', ['pack', '--dry-run', '--json', '--ignore-scripts']])
	assert.deepEqual(packCommand('npm'), ['npm', ['pack', '--dry-run', '--json', '--ignore-scripts']])
})
