import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
	MAX_TRACE,
	addScore,
	addTrace,
	awardOnce,
	clearRun,
	deductScore,
	freshSession,
	gotoNode,
	hasFlag,
	setLevel,
	startRun,
	toComplete,
	toPaused,
	toPlaying,
	toTitle,
} from './session.ts'

test('freshSession starts on the title with zeroes', () => {
	const session = freshSession(1200)

	assert.equal(session.status, 'title')
	assert.equal(session.node, 'gateway')
	assert.equal(session.level, 0)
	assert.equal(session.trace, 0)
	assert.equal(session.score, 0)
	assert.equal(session.hiScore, 1200)
	assert.deepEqual(session.flags, [])
	assert.equal(session.newHi, false)
})

test('startRun begins a clean playable run', () => {
	const session = startRun(freshSession(400))

	assert.equal(session.status, 'playing')
	assert.equal(session.node, 'gateway')
	assert.equal(session.score, 0)
	assert.equal(session.level, 0)
})

test('clearRun keeps the high score but drops progress', () => {
	const session = addScore(startRun(freshSession(0)), 300)
	const cleared = clearRun(session)

	assert.equal(cleared.hiScore, 300)
	assert.equal(cleared.score, 0)
	assert.equal(cleared.node, 'gateway')
	assert.deepEqual(cleared.flags, [])
})

test('addScore accumulates and tracks a new high score', () => {
	let session = freshSession(100)
	session = addScore(session, 50)

	assert.equal(session.hiScore, 100)
	assert.equal(session.newHi, false)

	session = addScore(session, 60)
	assert.equal(session.score, 110)
	assert.equal(session.hiScore, 110)
	assert.equal(session.newHi, true)
})

test('deductScore never goes negative', () => {
	let session = startRun(freshSession(0))
	session = addScore(session, 40)
	session = deductScore(session, 75)

	assert.equal(session.score, 0)
})

test('awardOnce grants points only once per flag', () => {
	let session = startRun(freshSession(0))
	session = awardOnce(session, 'key', 100)

	assert.equal(session.score, 100)
	assert.ok(hasFlag(session, 'key'))

	session = awardOnce(session, 'key', 100)
	assert.equal(session.score, 100)
	assert.equal(session.flags.length, 1)
})

test('setLevel only ever raises clearance', () => {
	let session = startRun(freshSession(0))
	session = setLevel(session, 2)
	session = setLevel(session, 1)

	assert.equal(session.level, 2)
})

test('addTrace clamps within limits', () => {
	let session = startRun(freshSession(0))
	session = addTrace(session, 40)
	session = addTrace(session, 90)

	assert.equal(session.trace, MAX_TRACE)
	session = addTrace(session, -999)
	assert.equal(session.trace, 0)
})

test('status views switch cleanly', () => {
	const session = startRun(freshSession(0))

	assert.equal(toPaused(session).status, 'paused')
	assert.equal(toPlaying(toPaused(session)).status, 'playing')
	assert.equal(toTitle(session).status, 'title')
	assert.equal(toComplete(session).status, 'complete')
})

test('gotoNode relocates the session', () => {
	const session = gotoNode(startRun(freshSession(0)), 'forge')

	assert.equal(session.node, 'forge')
})