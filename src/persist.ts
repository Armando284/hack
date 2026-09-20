// HACK.EXE — localStorage-backed persistence. Storage is injected so tests
// can run the module against a fake in-memory store.

import { HI_SCORE_KEY, SOUND_KEY } from './constants.ts'

export interface StorageLike {
	getItem(key: string): string | null
	setItem(key: string, value: string): void
}

export function loadHighScore(storage: StorageLike): number {
	try {
		return Number(storage.getItem(HI_SCORE_KEY)) || 0
	} catch {
		return 0
	}
}

export function saveHighScore(storage: StorageLike, score: number): void {
	try {
		storage.setItem(HI_SCORE_KEY, String(score))
	} catch {
		// storage unavailable — the session just won't persist the high score
	}
}

export function loadSoundEnabled(storage: StorageLike): boolean {
	try {
		return storage.getItem(SOUND_KEY) !== 'false'
	} catch {
		return true
	}
}

export function saveSoundEnabled(storage: StorageLike, enabled: boolean): void {
	try {
		storage.setItem(SOUND_KEY, enabled ? 'true' : 'false')
	} catch {
		// storage unavailable — the preference just won't persist
	}
}