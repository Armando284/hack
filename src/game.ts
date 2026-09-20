// HACK.EXE — game orchestrator. Captures keyboard input, feeds the terminal
// buffer, hands commands to the world and drives the frame loop. Input and
// commands stay separate from rendering.

import { parse } from './commandParser.ts'
import { type TerminalModel, appendLines, backspace, caretEnd, caretHome, clearScreen, freshTerminal, historyBack, historyForward, insertChar, moveCaret, pageDown, pageUp, submit } from './terminal.ts'
import { freshSession, startRun, toPaused, toPlaying, toTitle, type RunState } from './session.ts'
import { World, type ActionResult } from './world.ts'
import { saveHighScore, saveSoundEnabled, type StorageLike } from './persist.ts'
import type { Renderer } from './renderer.ts'
import type { Sfx } from './audio.ts'

interface GameElements {
	readonly ctx: CanvasRenderingContext2D
	readonly renderer: Renderer
	readonly sfx: Sfx
	readonly storage: StorageLike
}

export class Game {
	private readonly elements: GameElements

	private term: TerminalModel
	private world: World
	private persistedHi = 0
	private rafId = 0
	private lastTime = 0
	private time = 0
	private muted = false
	private focused = true

	constructor(elements: GameElements) {
		this.elements = elements
		this.term = freshTerminal([])
		this.world = new World(freshSession(0))
	}

	start(initialHiScore: number, soundEnabled: boolean): void {
		this.persistedHi = initialHiScore
		this.muted = !soundEnabled
		this.elements.sfx.enabled = !this.muted
		this.world = new World(freshSession(initialHiScore))
		this.term = freshTerminal([])
		this.bindInput()
		this.lastTime = performance.now()
		this.rafId = requestAnimationFrame(this.loop)
	}

	destroy(): void {
		cancelAnimationFrame(this.rafId)
		window.removeEventListener('keydown', this.onKeyDown)
		window.removeEventListener('blur', this.onBlur)
		window.removeEventListener('focus', this.onFocus)
	}

	// ---- run lifecycle -------------------------------------------------

	private beginRun(): void {
		this.world = new World(startRun(this.world.state))
		this.term = freshTerminal(this.world.arrival('gateway'))
	}

	// ---- input ---------------------------------------------------------

	private bindInput(): void {
		window.addEventListener('keydown', this.onKeyDown)
		window.addEventListener('blur', this.onBlur)
		window.addEventListener('focus', this.onFocus)
	}

	private readonly onBlur = (): void => {
		this.focused = false
	}

	private readonly onFocus = (): void => {
		this.focused = true
	}

	private readonly onKeyDown = (event: KeyboardEvent): void => {
		const status = this.world.state.status

		if (this.isControlKey(event, status)) {
			event.preventDefault()
		}

		switch (status) {
			case 'title':
				if (event.code === 'Enter') {
					this.beginRun()
				} else if (event.code === 'KeyM') {
					this.toggleMute()
				}
				return

			case 'complete':
				if (event.code === 'Enter') {
					this.beginRun()
				} else if (event.code === 'KeyQ') {
					this.world.state = toTitle(this.world.state)
				} else if (event.code === 'KeyM') {
					this.toggleMute()
				}
				return

			case 'paused':
				if (event.code === 'Escape' || event.code === 'KeyP') {
					this.world.state = toPlaying(this.world.state)
				} else if (event.code === 'KeyM' && event.ctrlKey) {
					this.toggleMute()
				}
				return

			case 'playing':
				this.handleTerminalKey(event)
				return
		}
	}

	private isControlKey(event: KeyboardEvent, status: RunState['status']): boolean {
		if (status !== 'playing') {
			return true
		}

		return (
			event.code === 'ArrowUp' ||
			event.code === 'ArrowDown' ||
			event.code === 'ArrowLeft' ||
			event.code === 'ArrowRight' ||
			event.code === 'Backspace' ||
			event.code === 'Home' ||
			event.code === 'End' ||
			event.code === 'PageUp' ||
			event.code === 'PageDown' ||
			event.code === 'Tab' ||
			event.code === 'Space' ||
			event.key === ' '
		)
	}

	private handleTerminalKey(event: KeyboardEvent): void {
		if (event.code === 'Escape') {
			this.world.state = toPaused(this.world.state)
			return
		}

		if (event.code === 'KeyM' && event.ctrlKey) {
			this.toggleMute()
			return
		}

		if (event.ctrlKey || event.altKey || event.metaKey) {
			return
		}

		switch (event.code) {
			case 'Enter':
				this.submitLine()
				return
			case 'Backspace':
				this.term = backspace(this.term)
				return
			case 'ArrowUp':
				this.term = historyBack(this.term)
				return
			case 'ArrowDown':
				this.term = historyForward(this.term)
				return
			case 'ArrowLeft':
				this.term = moveCaret(this.term, -1)
				return
			case 'ArrowRight':
				this.term = moveCaret(this.term, 1)
				return
			case 'Home':
				this.term = caretHome(this.term)
				return
			case 'End':
				this.term = caretEnd(this.term)
				return
			case 'PageUp':
				this.term = pageUp(this.term)
				return
			case 'PageDown':
				this.term = pageDown(this.term)
				return
			case 'Tab':
				return
		}

		if (event.key.length === 1) {
			this.term = insertChar(this.term, event.key)
			this.elements.sfx.key()
		}
	}

	private submitLine(): void {
		const submitted = submit(this.term)
		this.term = submitted.model

		const parsed = parse(submitted.input)

		if (!parsed.ok) {
			return
		}

		const result = this.world.execute(parsed.command, parsed.args)
		this.applyResult(result)
	}

	private applyResult(result: ActionResult): void {
		if (result.clear) {
			this.term = clearScreen(this.term)
		}

		this.term = appendLines(this.term, result.lines)

		this.playSound(result.sound)

		this.persistIfNeeded()
	}

	private playSound(sound: ActionResult['sound']): void {
		if (!sound) {
			return
		}

		switch (sound) {
			case 'accept':
				this.elements.sfx.accept()
				break
			case 'deny':
				this.elements.sfx.deny()
				break
			case 'unlock':
				this.elements.sfx.unlock()
				break
			case 'complete':
				this.elements.sfx.complete()
				break
		}
	}

	private persistIfNeeded(): void {
		if (this.world.state.score > this.persistedHi) {
			saveHighScore(this.elements.storage, this.world.state.score)
			this.persistedHi = this.world.state.score
		}
	}

	private toggleMute(): void {
		this.muted = !this.muted
		this.elements.sfx.enabled = !this.muted
		saveSoundEnabled(this.elements.storage, !this.muted)
	}

	// ---- main loop -----------------------------------------------------

	private readonly loop = (now: number): void => {
		this.rafId = requestAnimationFrame(this.loop)

		const dt = Math.min((now - this.lastTime) / 1000, 1 / 30)
		this.lastTime = now
		this.time += dt

		this.elements.renderer.stamp(this.time)
		this.draw()
	}

	private draw(): void {
		const { renderer } = this.elements
		const session = this.world.state

		switch (session.status) {
			case 'title':
				renderer.title(session)
				break
			case 'playing':
				renderer.reset()
				renderer.terminal(this.term, session, this.focused)
				break
			case 'paused':
				renderer.reset()
				renderer.paused(this.term, session)
				break
			case 'complete':
				renderer.complete(session)
				break
		}
	}
}