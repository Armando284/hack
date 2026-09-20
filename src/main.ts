// HACK.EXE — entry point. Boot overlay, then hand off to the Game.

import './style.css'
import { Game } from './game.ts'
import { Boot } from './boot.ts'
import { createSfx } from './audio.ts'
import { loadHighScore, loadSoundEnabled } from './persist.ts'
import { Renderer } from './renderer.ts'
import { CANVAS_HEIGHT, CANVAS_WIDTH } from './constants.ts'

const canvas = document.getElementById('game')

if (!(canvas instanceof HTMLCanvasElement)) {
	throw new Error('HACK.EXE: #game canvas not found')
}

canvas.width = CANVAS_WIDTH
canvas.height = CANVAS_HEIGHT

const ctx = canvas.getContext('2d')

if (!ctx) {
	throw new Error('HACK.EXE: 2d context unavailable')
}

// The WebAudio context starts suspended until a user gesture; the boot press
// doubles as the first gesture so we resume it there.
const audioContext = new AudioContext()
const sfx = createSfx(audioContext)

const renderer = new Renderer(ctx)
const storage = window.localStorage

const game = new Game({ ctx, renderer, sfx, storage })

export function launch(): void {
	if (audioContext.state === 'suspended') {
		void audioContext.resume()
	}
	game.start(loadHighScore(storage), loadSoundEnabled(storage))
}

const boot = new Boot()
boot.start(() => {
	launch()
})