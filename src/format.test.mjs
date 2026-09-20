import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pad, repeat, traceBar } from './format.ts'

test('pad zero-fills to the given width', () => {
	assert.equal(pad(12), '000012')
	assert.equal(pad(1234, 6), '001234')
	assert.equal(pad(123456), '123456')
	assert.equal(pad(0, 3), '000')
	assert.equal(pad(1299.9), '001299')
})

test('pad truncates nothing for larger values', () => {
	assert.equal(pad(9999999), '9999999')
})

test('traceBar renders ten blocks at the right fill', () => {
	assert.equal(traceBar(0), '░░░░░░░░░░')
	assert.equal(traceBar(30), '███░░░░░░░')
	assert.equal(traceBar(100), '██████████')
	assert.equal(traceBar(50.6), '█████░░░░░')
})

test('traceBar clamps out-of-range values', () => {
	assert.equal(traceBar(-5), '░░░░░░░░░░')
	assert.equal(traceBar(240), '██████████')
})

test('repeat repeats and guards negatives', () => {
	assert.equal(repeat('#', 4), '####')
	assert.equal(repeat('#', 0), '')
	assert.equal(repeat('#', -3), '')
})