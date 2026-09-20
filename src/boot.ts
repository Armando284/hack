// HACK.EXE boot overlay — night-blue splash. Typewrites a few terminal
// lines, then awaits a key (or auto-boots) to hand off to the game.

const AUTO_START_DELAY = 1600

const BOOT_TEMPLATES = [
	[
		'HACK.EXE - NIGHTFALL SECURITY TERMINAL v1.0',
		'',
		'UPLINK ................... SYNCED',
		'FIREWALL ................. HALTED',
		'KEYBOARD CHANNEL ......... READY',
		'DECODER MODULE ........... DORMANT',
		'TRACE MONITOR ............ ARMED',
	],
	[
		'HACK.EXE - NIGHTFALL SECURITY TERMINAL v1.0',
		'',
		'CRT PHOSPHOR ............. ALIGNED',
		'NETWORK MAP .............. FRESH',
		'LOG ARCHIVE .............. SEEDED',
		'GATE CREDENTIALS ......... ROTATED',
		'SESSION SEED ............. DAILY',
	],
][Math.floor(Math.random() * 2)]

const BOOT_LINES = [...BOOT_TEMPLATES, '', 'PRESS ANY KEY OR AUTO-BOOT']

export class Boot {
	private readonly overlay: HTMLElement
	private readonly output: HTMLElement
	private onComplete: (() => void) | null = null
	private lineIndex = 0
	private charIndex = 0
	private timer = 0
	private done = false

	constructor() {
		const overlay = document.getElementById('boot')
		const output = document.getElementById('boot-text')

		if (!overlay || !output) {
			throw new Error('Boot overlay elements not found')
		}

		this.overlay = overlay
		this.output = output
	}

	start(onComplete: () => void): void {
		this.onComplete = onComplete
		window.addEventListener('keydown', this.handleKeyDown)
		this.overlay.addEventListener('pointerdown', this.handleKeyDown)
		this.typeNextChar()
	}

	private typeNextChar = (): void => {
		const line = BOOT_LINES[this.lineIndex]

		if (line && this.charIndex < line.length) {
			this.output.textContent += line[this.charIndex]
			this.charIndex++
			this.timer = window.setTimeout(this.typeNextChar, 12)
			return
		}

		this.output.textContent += '\n'
		this.lineIndex++
		this.charIndex = 0

		if (this.lineIndex < BOOT_LINES.length) {
			this.timer = window.setTimeout(this.typeNextChar, 100)
			return
		}

		this.timer = window.setTimeout(this.finish, AUTO_START_DELAY)
	}

	private finish = (): void => {
		if (this.done) {
			return
		}

		this.done = true
		window.removeEventListener('keydown', this.handleKeyDown)
		this.overlay.removeEventListener('pointerdown', this.handleKeyDown)
		window.clearTimeout(this.timer)

		this.overlay.classList.add('boot-hidden')

		window.setTimeout(() => {
			this.overlay.remove()
			this.onComplete?.()
		}, 320)
	}

	private handleKeyDown = (): void => {
		if (this.done) {
			return
		}

		this.finish()
	}
}