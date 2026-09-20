// HACK.EXE — tiny Web Audio blips. One oscillator, a volume envelope and a
// handful of canned note sequences; nothing library-backed.

export interface Sfx {
	enabled: boolean
	key(): void
	accept(): void
	deny(): void
	unlock(): void
	complete(): void
}

export function createSfx(context: AudioContext): Sfx {
	let soundOn = true

	function tone(frequency: number, start: number, duration: number, type: OscillatorType, volume: number): void {
		if (!soundOn) {
			return
		}

		const oscillator = context.createOscillator()
		const gain = context.createGain()
		const at = context.currentTime + start

		oscillator.type = type
		oscillator.frequency.setValueAtTime(frequency, at)

		gain.gain.setValueAtTime(0, at)
		gain.gain.linearRampToValueAtTime(volume, at + 0.005)
		gain.gain.exponentialRampToValueAtTime(0.0001, at + duration)

		oscillator.connect(gain)
		gain.connect(context.destination)

		oscillator.start(at)
		oscillator.stop(at + duration + 0.02)
	}

	return {
		get enabled(): boolean {
			return soundOn
		},
		set enabled(value: boolean) {
			soundOn = value
		},
		key() {
			tone(340, 0, 0.045, 'square', 0.022)
		},
		accept() {
			tone(660, 0, 0.08, 'square', 0.05)
			tone(880, 0.09, 0.1, 'square', 0.05)
		},
		deny() {
			tone(180, 0, 0.16, 'sawtooth', 0.06)
			tone(120, 0.18, 0.14, 'sawtooth', 0.05)
		},
		unlock() {
			tone(440, 0, 0.08, 'square', 0.045)
			tone(550, 0.08, 0.08, 'square', 0.045)
			tone(660, 0.16, 0.12, 'square', 0.05)
		},
		complete() {
			const notes = [523, 659, 784, 1046]
			notes.forEach((freq, index) => tone(freq, index * 0.12, 0.22, 'square', 0.05))
		},
	}
}