import { test } from 'node:test'
import assert from 'node:assert/strict'
import { HI_SCORE_KEY, SOUND_KEY } from './constants.ts'
import {
	loadHighScore,
	loadSoundEnabled,
	saveHighScore,
	saveSoundEnabled,
} from './persist.ts'

class MemoryStorage {
	#map = new Map()

	getItem(key) {
		return this.#map.get(key) ?? null
	}

	setItem(key, value) {
		this.#map.set(key, value)
	}
}

test('loadHighScore reads a stored score', () => {
	const storage = new MemoryStorage()
	storage.setItem(HI_SCORE_KEY, '4200')

	assert.equal(loadHighScore(storage), 4200)
})

test('loadHighScore defaults to zero on a missing or bad value', () => {
	assert.equal(loadHighScore(new MemoryStorage()), 0)

	const junk = new MemoryStorage()
	junk.setItem(HI_SCORE_KEY, 'nonsense')
	assert.equal(loadHighScore(junk), 0)
})

test('saveHighScore round-trips through storage', () => {
	const storage = new MemoryStorage()
	saveHighScore(storage, 7777)

	assert.equal(loadHighScore(storage), 7777)
})

test('sound preference defaults to enabled and persists', () => {
	const storage = new MemoryStorage()

	assert.equal(loadSoundEnabled(storage), true)

	saveSoundEnabled(storage, false)
	assert.equal(loadSoundEnabled(storage), false)

	saveSoundEnabled(storage, true)
	assert.equal(loadSoundEnabled(storage), true)
})

test('broken storage never throws', () => {
	const broken = {
		getItem: () => {
			throw new Error('denied')
		},
		setItem: () => {
			throw new Error('denied')
		},
	}

	assert.equal(loadHighScore(broken), 0)
	assert.doesNotThrow(() => saveHighScore(broken, 1))
	assert.equal(loadSoundEnabled(broken), true)
	assert.doesNotThrow(() => saveSoundEnabled(broken, false))
})