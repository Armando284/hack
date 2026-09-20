import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parse } from './commandParser.ts'

test('empty input is reported as empty', () => {
	assert.deepEqual(parse(''), { ok: false, error: 'empty' })
	assert.deepEqual(parse('   '), { ok: false, error: 'empty' })
})

test('recognizes a bare command', () => {
	const parsed = parse('help')

	assert.equal(parsed.ok, true)
	if (parsed.ok) {
		assert.equal(parsed.command, 'help')
		assert.deepEqual(parsed.args, [])
	}
})

test('commands are lowercased', () => {
	const parsed = parse('STATUS')

	assert.equal(parsed.ok, true)
	if (parsed.ok) {
		assert.equal(parsed.command, 'status')
	}
})

test('tokenizes arguments', () => {
	const parsed = parse('decode STIR SHIFT-4')

	assert.equal(parsed.ok, true)
	if (parsed.ok) {
		assert.equal(parsed.command, 'decode')
		assert.deepEqual(parsed.args, ['STIR', 'SHIFT-4'])
	}
})

test('multiword arguments survive as separate tokens', () => {
	const parsed = parse('auth meridian voidhalo')

	assert.equal(parsed.ok, true)
	if (parsed.ok) {
		assert.deepEqual(parsed.args, ['meridian', 'voidhalo'])
	}
})

test('question mark expands to help', () => {
	const parsed = parse('?')

	assert.equal(parsed.ok, true)
	if (parsed.ok) {
		assert.equal(parsed.command, 'help')
	}
})

test('ls and cat expand to files and read', () => {
	assert.equal(parse('ls').ok && parse('ls').command, 'files')
	assert.equal(parse('cat guard.log').ok && parse('cat guard.log').command, 'read')
})

test('collapses repeated whitespace', () => {
	const parsed = parse('  scan   relay ')

	assert.equal(parsed.ok, true)
	if (parsed.ok) {
		assert.deepEqual(parsed.args, ['relay'])
	}
})