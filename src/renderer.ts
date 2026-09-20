// HACK.EXE — canvas renderer. Draws the terminal frame, the scrollback, the
// prompt line, the HUD and the title/pause/complete screens. It never
// evaluates a command or touches puzzle state.

import {
	CANVAS_HEIGHT,
	CANVAS_WIDTH,
	CHAR_W,
	FONT_PX,
	FRAME_PAD,
	HEADER_HEIGHT,
	LINE_H,
	PALETTE,
	STATUS_HEIGHT,
} from './constants.ts'
import type { LineKind, TerminalModel } from './terminal.ts'
import type { NodeId, RunState } from './session.ts'
import { pad, traceBar } from './format.ts'

const FONT = '"VT323", "IBM Plex Mono", "Courier New", monospace'
const NODE_NAME: Record<NodeId, string> = {
	gateway: 'NODE-01',
	relay: 'RELAY-07',
	forge: 'NODE-03',
	core: 'CORE',
}

const KIND_COLOR: Record<LineKind, string> = {
	cmd: PALETTE.bright,
	out: PALETTE.text,
	head: PALETTE.accent,
	ok: PALETTE.green,
	warn: PALETTE.amber,
	err: PALETTE.red,
	sys: PALETTE.accent,
	dim: PALETTE.dim,
}

export class Renderer {
	private readonly ctx: CanvasRenderingContext2D
	private time = 0

	constructor(ctx: CanvasRenderingContext2D) {
		this.ctx = ctx
	}

	// Frame-clock strobe so the cursor blinks and effects drift with time.
	stamp(time: number): void {
		this.time = time
	}

	reset(): void {
		const ctx = this.ctx
		ctx.setTransform(1, 0, 0, 1, 0, 0)
		ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
		ctx.fillStyle = PALETTE.bg
		ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
	}

	private textArea(): { left: number; top: number; right: number; bottom: number; rows: number } {
		const left = FRAME_PAD
		const top = HEADER_HEIGHT + 6
		const right = CANVAS_WIDTH - FRAME_PAD
		const bottom = CANVAS_HEIGHT - STATUS_HEIGHT - 10
		const rows = Math.floor((bottom - top) / LINE_H)

		return { left, top, right, bottom, rows: Math.max(1, rows) }
	}

	// ---- terminal screen ----------------------------------------------

	terminal(model: TerminalModel, session: RunState, focused: boolean): void {
		const ctx = this.ctx
		const area = this.textArea()

		this.drawFrame()

		// Header.
		this.font('bold', FONT_PX)
		this.fillText(`HACK.EXE — NIGHTFALL TERMINAL`, FRAME_PAD + 4, 12, PALETTE.text)
		this.fillText(
			`${NODE_NAME[session.node]} // ${session.node.toUpperCase()}  LVL ${session.level}`,
			CANVAS_WIDTH - FRAME_PAD - 4,
			12,
			PALETTE.accent,
			'right',
		)

		// Scrollback, clipped to the body.
		ctx.save()
		ctx.beginPath()
		ctx.rect(area.left, area.top, area.right - area.left, area.bottom - area.top)
		ctx.clip()

		const scrollRows = Math.max(1, area.rows - 2)
		const total = model.lines.length
		const offset = Math.min(model.offset, Math.max(0, total - scrollRows))
		const start = Math.max(0, total - scrollRows - offset)
		const columns = Math.max(20, Math.floor((area.right - area.left) / CHAR_W))

		this.font('normal', FONT_PX)
		ctx.textBaseline = 'alphabetic'

		for (let row = 0; row < scrollRows; row++) {
			const index = start + row
			if (index >= total) {
				break
			}

			const entry = model.lines[index]!
			const glyph = entry.kind === 'cmd' ? `> ${entry.text}` : entry.text
			this.fillText(glyph, area.left, area.top + row * LINE_H + 13, KIND_COLOR[entry.kind])
		}

		// The persistent prompt line.
		const promptY = area.bottom - LINE_H + 13
		this.fillText('> ', area.left, promptY, PALETTE.bright)
		const shown = model.input.slice(Math.max(0, model.caret - (columns - 3)))
		const startCaret = Math.max(0, model.caret - (columns - 3))
		this.fillText(shown, area.left + CHAR_W * 2, promptY, PALETTE.text)

		// Blinking block cursor.
		if (focused && this.cursorOn()) {
			const caretX = area.left + CHAR_W * (2 + (model.caret - startCaret))
			const blockY = area.bottom - LINE_H + 4
			ctx.fillStyle = PALETTE.amber
			ctx.fillRect(caretX, blockY, CHAR_W - 1, LINE_H - 6)
		}

		// Scroll indicator.
		if (offset > 0) {
			this.font('normal', FONT_PX)
			this.fillText(`▲ ${offset}`, area.right - 52, area.top + 13, PALETTE.dim)
		}

		this.drawScrollbar(area, total, offset)

		// Faint phosphor scan band.
		const scanY = area.top + ((this.time * 42) % Math.max(1, area.bottom - area.top))
		ctx.fillStyle = 'rgba(215, 230, 255, 0.02)'
		ctx.fillRect(area.left, scanY, area.right - area.left, 2)

		ctx.restore()

		this.drawStatusBar(session)
	}

	private drawFrame(): void {
		const ctx = this.ctx

		// Outer CRT bezel.
		ctx.strokeStyle = PALETTE.border
		ctx.lineWidth = 2
		ctx.strokeRect(3, 3, CANVAS_WIDTH - 6, CANVAS_HEIGHT - 6)

		// Inner face plate.
		ctx.fillStyle = PALETTE.frame
		ctx.fillRect(6, 6, CANVAS_WIDTH - 12, CANVAS_HEIGHT - 12)

		// Dividing rules.
		ctx.strokeStyle = PALETTE.border
		ctx.lineWidth = 1
		themeLine(ctx, 6, HEADER_HEIGHT + 4, CANVAS_WIDTH - 12)
		themeLine(ctx, 6, CANVAS_HEIGHT - STATUS_HEIGHT - 8, CANVAS_WIDTH - 12)
	}

	private drawStatusBar(session: RunState): void {
		const y = CANVAS_HEIGHT - STATUS_HEIGHT / 2 - 2

		this.font('normal', FONT_PX)
		const label = `TRACE ${traceBar(session.trace)} ${session.trace}%`
		const color = session.trace >= 85 ? PALETTE.red : session.trace >= 55 ? PALETTE.amber : PALETTE.text
		this.fillText(label, FRAME_PAD + 8, y, color)

		this.font('bold', FONT_PX)
		this.fillText(`SCORE ${pad(session.score)}  HI ${pad(session.hiScore)}`, CANVAS_WIDTH - FRAME_PAD - 8, y, PALETTE.bright, 'right')
	}

	private drawScrollbar(area: { top: number; bottom: number; right: number; rows: number }, total: number, offset: number): void {
		const ctx = this.ctx
		const height = Math.max(1, area.bottom - area.top)
		const scrollRows = Math.max(1, area.rows - 2)

		if (total <= scrollRows) {
			return
		}

		const trackY = 40
		const trackBottom = height - 10
		const trackHeight = trackBottom - trackY

		ctx.fillStyle = 'rgba(102, 128, 158, 0.25)'
		ctx.fillRect(area.right - 4, area.top + trackY, 3, trackHeight)

		const thumbSize = Math.max(12, (scrollRows / total) * trackHeight)
		const maxOffset = total - scrollRows
		const thumbY = maxOffset === 0 ? 0 : (offset / maxOffset) * (trackHeight - thumbSize)

		ctx.fillStyle = PALETTE.dim
		ctx.fillRect(area.right - 4, area.top + trackY + thumbY, 3, thumbSize)
	}

	// ---- title screen --------------------------------------------------

	title(session: RunState): void {
		this.reset()
		this.drawFrame()

		const blink = this.cursorOn()
		const cx = CANVAS_WIDTH / 2
		const box = '#'.repeat(46)

		this.terminalFont(FONT_PX)
		this.fillText(box, cx, 96, PALETTE.dim, 'center')

		this.largeFont()
		this.fillText('HACK.EXE', cx, 146, PALETTE.bright, 'center')

		this.terminalFont(FONT_PX)
		this.fillText('NIGHTFALL SECURITY NETWORK', cx, 180, PALETTE.accent, 'center')

		this.terminalFont(FONT_PX + 4)
		this.fillText('ACCESS DENIED', cx, 216, PALETTE.red, 'center')

		this.terminalFont(FONT_PX + 2)
		if (blink) {
			this.fillText('[ ENTER ]', cx, 252, PALETTE.green, 'center')
		} else {
			this.fillText('[ ENTER ]', cx, 252, PALETTE.dim, 'center')
		}

		this.terminalFont(FONT_PX)
		this.fillText('TALLERWEB ARCADE', cx, 290, PALETTE.dim, 'center')
		this.fillText(box, cx, 322, PALETTE.dim, 'center')

		this.fillText(`TYPE TO COMMAND THE NETWORK — HI ${pad(session.hiScore)}`, cx, 366, PALETTE.dim, 'center')

		// Bottom hint bar.
		this.font('normal', FONT_PX)
		this.fillText('P PAUSE // M MUTE // ENTER CONNECT', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 46, PALETTE.dim, 'center')
	}

	// ---- pause / complete ---------------------------------------------

	paused(model: TerminalModel, session: RunState): void {
		const ctx = this.ctx

		this.terminal(model, session, false)

		const area = this.textArea()
		ctx.fillStyle = 'rgba(3, 8, 17, 0.8)'
		ctx.fillRect(area.left - 4, area.top - 4, area.right - area.left + 8, area.bottom - area.top + 8)

		this.largeFont()
		this.fillText('PAUSED', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 12, PALETTE.amber, 'center')
		this.terminalFont(FONT_PX)
		this.fillText('P RESUMES // M MUTES', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 20, PALETTE.dim, 'center')
	}

	complete(session: RunState): void {
		this.reset()
		this.drawFrame()

		const blink = this.cursorOn()
		const cx = CANVAS_WIDTH / 2

		this.largeFont()
		this.fillText('MISSION COMPLETE', cx, 150, PALETTE.accent, 'center')

		this.terminalFont(FONT_PX + 4)
		this.fillText('DATA CORE SECURED', cx, 196, PALETTE.green, 'center')

		this.terminalFont(FONT_PX + 6)
		this.fillText(`SCORE ${pad(session.score)}`, cx, 258, PALETTE.bright, 'center')

		if (session.newHi) {
			this.fillText(blink ? '** NEW HIGH SCORE **' : '** NEW HIGH SCORE **', cx, 296, blink ? PALETTE.amber : PALETTE.dim, 'center')
		} else {
			this.fillText(`HI ${pad(session.hiScore)}`, cx, 296, PALETTE.dim, 'center')
		}

		this.terminalFont(FONT_PX)
		this.fillText('CLEARANCE LEVEL 3 // ROOT ACCESS', cx, 344, PALETTE.dim, 'center')

		if (blink) {
			this.fillText('ENTER RESTART // Q TITLE', cx, CANVAS_HEIGHT - 64, PALETTE.green, 'center')
		} else {
			this.fillText('ENTER RESTART // Q TITLE', cx, CANVAS_HEIGHT - 64, PALETTE.dim, 'center')
		}
	}

	// ---- text helpers --------------------------------------------------

	private cursorOn(): boolean {
		return Math.floor(this.time / 0.55) % 2 === 0
	}

	private font(weight: 'normal' | 'bold', size: number): void {
		const ctx = this.ctx
		ctx.font = `${weight} ${size}px ${FONT}`
		ctx.textBaseline = 'alphabetic'
	}

	private terminalFont(size: number): void {
		this.font('normal', size)
	}

	private largeFont(): void {
		this.font('bold', 44)
	}

	private fillText(value: string, x: number, y: number, color: string, align: 'left' | 'right' | 'center' = 'left'): void {
		const ctx = this.ctx
		ctx.fillStyle = color
		ctx.textAlign = align
		ctx.fillText(value, x, y)
		ctx.textAlign = 'left'
	}
}

// Draw a single horizontal rule in the current stroke style.
function themeLine(ctx: CanvasRenderingContext2D, x: number, y: number, width: number): void {
	ctx.beginPath()
	ctx.moveTo(x, y + 0.5)
	ctx.lineTo(x + width, y + 0.5)
	ctx.stroke()
}