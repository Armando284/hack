import { test } from 'node:test'
import assert from 'node:assert/strict'
import { freshSession, startRun } from './session.ts'
import { World } from './world.ts'

function fresh() {
	return new World(startRun(freshSession(0)))
}

function run(world, line) {
	const [command, ...args] = line.split(/\s+/)
	return world.execute(command.toLowerCase(), args)
}

function text(result) {
	return result.lines.map((entry) => entry.text).join('\n')
}

function has(result, needle) {
	return text(result).includes(needle)
}

// ---- discovery & stepping ---------------------------------------------

test('help shows the base vocabulary and hides the decoder at the gateway', () => {
	const world = fresh()
	const result = run(world, 'help')

	assert.ok(has(result, 'STATUS'))
	assert.ok(has(result, 'READ'))
	assert.ok(!has(result, 'DECODE'))
})

test('status and scan establish the scene', () => {
	const world = fresh()

	assert.ok(has(run(world, 'status'), 'NODE-01'))
	assert.ok(has(run(world, 'scan'), 'RELAY-07'))
	assert.ok(has(run(world, 'scan'), 'WATCHDOG'))
})

test('files and logs at the gateway explain the puzzle', () => {
	const world = fresh()
	const files = run(world, 'files')
	const logs = run(world, 'logs')

	assert.ok(has(files, 'guard.log'))
	assert.ok(has(logs, 'OPERATOR ID'))
	assert.ok(has(logs, 'OPERATOR PASS'))
})

test('reading guard.log reveals the operator pair', () => {
	const world = fresh()
	const result = run(world, 'read guard.log')

	assert.ok(has(result, 'MERIDIAN'))
	assert.ok(has(result, 'VOIDHALO'))
})

test('reading an unknown file is a clear error', () => {
	const world = fresh()
	assert.ok(has(run(world, 'read missing.txt'), 'NO SUCH FILE'))
})

test('auth requires an id and a pass', () => {
	const world = fresh()
	assert.ok(has(run(world, 'auth core'), 'AUTH WHAT'))
	assert.ok(has(run(world, 'auth foo'), 'AUTH WHAT'))
})

test('decode is not available before the relay', () => {
	const world = fresh()
	assert.ok(has(run(world, 'decode STIR SHIFT-4'), 'MODULE NOT LOADED'))
})

// ---- failure states ----------------------------------------------------

test('a wrong pass denies and raises the trace', () => {
	const world = fresh()
	const before = world.state.trace

	const result = run(world, 'auth meridian wrong')
	assert.ok(has(result, 'DENIED'))
	assert.equal(world.state.trace, before + 10)
})

test('an unknown operator is rejected more gently', () => {
	const world = fresh()
	const result = run(world, 'auth zork glaorp')

	assert.ok(has(result, 'UNKNOWN OPERATOR'))
	assert.equal(world.state.trace, 5)
})

test('connecting to a locked node is denied without penalty on wrong target', () => {
	const world = fresh()
	assert.ok(has(run(world, 'connect core'), 'NOT IN VIEW'))
	assert.equal(world.state.trace, 0)
})

test('ignoring the trace cap burns the link but keeps progress', () => {
	const world = fresh()

	run(world, 'auth meridian voidhalo')
	assert.equal(world.state.score, 100)

	for (let index = 0; index < 9; index++) {
		run(world, 'auth meridian wrong')
	}
	assert.equal(world.state.trace, 90)

	const result = run(world, 'auth meridian wrong')
	assert.ok(has(result, 'TERMINATED'))
	assert.equal(world.state.node, 'gateway')
	assert.equal(world.state.trace, 0)
	assert.equal(world.state.score, 50)
	assert.ok(world.state.flags.includes('level1'))

	const relink = run(world, 'connect relay-07')
	assert.equal(world.state.node, 'relay')
	assert.ok(!has(relink, 'DENIED'))
})

// ---- the full playthrough ----------------------------------------------

test('the relay node is solved by reading bias and decoding the keycard', () => {
	const world = fresh()

	run(world, 'auth meridian voidhalo')
	const link = run(world, 'connect relay-07')

	assert.equal(world.state.node, 'relay')
	assert.ok(has(link, 'DECODER MODULE'))
	assert.ok(has(run(world, 'help'), 'DECODE'))

	const log = run(world, 'read relay.log')
	assert.ok(has(log, 'SHIFT BIAS SET TO 4'))

	const card = run(world, 'read keycard.dat')
	assert.ok(has(card, 'STIR'))

	const wrong = run(world, 'decode STIR SHIFT-2')
	assert.ok(has(wrong, 'UNINTELLIGIBLE'))

	const right = run(world, 'decode STIR SHIFT-4')
	assert.ok(has(right, 'KEYCARD UNSEALED'))
	assert.ok(world.state.flags.includes('keycard'))
	assert.equal(world.state.score, 350)

	const gate = run(world, 'connect node-03')
	assert.equal(world.state.node, 'forge')
})

test('nav is idempotent: revisiting an unlocked node does not re-award', () => {
	const world = fresh()
	run(world, 'auth meridian voidhalo')
	run(world, 'connect relay-07')
	run(world, 'disconnect')

	assert.equal(world.state.node, 'gateway')
	const back = run(world, 'connect relay-07')

	assert.equal(world.state.node, 'relay')
	assert.equal(world.state.score, 250)
	assert.ok(!has(back, 'DENIED'))
})

test('the forge traps the decoy and yields the rune', () => {
	const world = fresh()
	run(world, 'auth meridian voidhalo')
	run(world, 'connect relay-07')
	run(world, 'decode STIR SHIFT-4')
	run(world, 'connect node-03')

	const log = run(world, 'read forge.log')
	assert.ok(has(log, 'CORE PASS'))

	const rune = run(world, 'read rune.dat')
	assert.ok(has(rune, 'ZEYPX'))

	const decoy = run(world, 'decode STIR SHIFT-4')
	assert.ok(has(decoy, 'DECOY'))
	assert.ok(world.state.trace > 0)

	const decoded = run(world, 'decode ZEYPX SHIFT-4')
	assert.ok(has(decoded, 'VAULT'))
	assert.ok(world.state.flags.includes('rune'))
})

test('auth with the wrong composite never opens the core', () => {
	const world = fresh()
	run(world, 'auth meridian voidhalo')
	run(world, 'connect relay-07')
	run(world, 'decode STIR SHIFT-4')
	run(world, 'connect node-03')
	run(world, 'decode ZEYPX SHIFT-4')

	assert.ok(has(run(world, 'auth core open'), 'DENIED'))
	assert.ok(world.state.flags.includes('level3') === false)
})

test('the whole arcade run is completable with only in-game info', () => {
	const world = fresh()

	run(world, 'auth meridian voidhalo')
	run(world, 'connect relay-07')
	run(world, 'decode STIR SHIFT-4')
	run(world, 'connect node-03')
	run(world, 'decode ZEYPX SHIFT-4')
	run(world, 'auth core openvault')

	assert.equal(world.state.level, 3)
	const toCore = run(world, 'connect core')
	assert.equal(world.state.node, 'core')
	assert.ok(has(toCore, 'extract'))

	const final = run(world, 'extract')
	assert.ok(has(final, 'SECURED'))
	assert.equal(world.state.status, 'complete')
	assert.ok(world.state.flags.includes('extract'))
	assert.equal(world.state.node, 'core')
	assert.ok(world.state.score > 1000)
	assert.equal(world.state.newHi, true)
})

test('extract is refused anywhere but the core', () => {
	const world = fresh()
	assert.ok(has(run(world, 'extract'), 'REACH THE CORE'))
})

test('a dirty run earns a smaller clean bonus', () => {
	const clean = finish('clean')
	const dirty = finish('dirty')

	assert.ok(dirty.trace > 0)
	assert.ok(dirty.score < clean.score)
	assert.equal(clean.score - dirty.score, dirty.trace)
})

function finish(kind) {
	const world = fresh()

	run(world, 'auth meridian voidhalo')
	run(world, 'connect relay-07')
	run(world, 'decode STIR SHIFT-4')
	run(world, 'connect node-03')

	if (kind === 'dirty') {
		run(world, 'decode STIR SHIFT-4')
	}

	run(world, 'decode ZEYPX SHIFT-4')
	run(world, 'auth core openvault')
	run(world, 'connect core')
	run(world, 'extract')

	return world.state
}