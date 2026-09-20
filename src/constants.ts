// HACK.EXE — shared layout values and the night-blue terminal palette.
// The terminal is a fixed logical canvas; CSS scales it to the viewport.

export const CANVAS_WIDTH = 1040
export const CANVAS_HEIGHT = 680

// Terminal frame bands.
export const HEADER_HEIGHT = 32
export const STATUS_HEIGHT = 28
export const FRAME_PAD = 14

// Monospace cell metrics used by the renderer and the text wrapper.
export const FONT_PX = 15
export const CHAR_W = 9
export const LINE_H = 17
export const COLUMNS = 108
export const MAX_TERMINAL_LINES = 400
export const HISTORY_LIMIT = 60

// --- persistence -------------------------------------------------------

export const HI_SCORE_KEY = 'hack-hi-score'
export const SOUND_KEY = 'hack-sound-enabled'

// --- palette -----------------------------------------------------------

// Night-blue phosphor: most text is an icy white, accents stay cyan, the
// classic denials and warnings use red/amber so the eye finds failures fast.
export const PALETTE = {
	bg: '#030811',
	frame: '#0b1a2f',
	border: '#26486f',
	accent: '#8fd0ff',
	text: '#d7e6ff',
	dim: '#66809e',
	bright: '#ffffff',
	green: '#8dffb5',
	amber: '#ffd166',
	red: '#ff7676',
} as const