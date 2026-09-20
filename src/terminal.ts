// HACK.EXE — the in-memory terminal model. Purely a text buffer + input
// editor (caret, backspace, history, scrolling, line wrapping). It knows
// nothing about commands or the puzzle; the game drives it with the raw
// strings below.

import { COLUMNS, HISTORY_LIMIT, MAX_TERMINAL_LINES } from './constants.ts'

export type LineKind =
	| 'cmd'
	| 'out'
	| 'head'
	| 'ok'
	| 'warn'
	| 'err'
	| 'sys'
	| 'dim'

export interface TermLine {
	text: string
	kind: LineKind
}

export interface TerminalModel {
	lines: TermLine[]
	input: string
	caret: number
	draft: string
	history: string[]
	historyIndex: number
	// Lines scrolled up from the bottom of the buffer; 0 means "follow".
	offset: number
}

export function freshTerminal(welcome: TermLine[]): TerminalModel {
	return {
		lines: [...welcome],
		input: '',
		caret: 0,
		draft: '',
		history: [],
		historyIndex: -1,
		offset: 0,
	}
}

export function line(text: string, kind: LineKind = 'out'): TermLine {
	return { text, kind }
}

// Append committed lines, wrapping each to a fixed column count and trimming
// the buffer tail so it cannot grow forever. New output snaps the view to
// the bottom unless the player is already scrolled up.
export function appendLines(model: TerminalModel, lines: TermLine[], columns = COLUMNS): TerminalModel {
	const wrapped: TermLine[] = []

	for (const entry of lines) {
		for (const fragment of wrapText(entry.text, columns)) {
			wrapped.push({ text: fragment, kind: entry.kind })
		}
	}

	const grown = [...model.lines, ...wrapped]
	const trimmed = grown.length > MAX_TERMINAL_LINES ? grown.slice(grown.length - MAX_TERMINAL_LINES) : grown
	const offset = model.offset === 0 ? 0 : Math.min(model.offset + wrapped.length, trimmed.length)

	return { ...model, lines: trimmed, offset }
}

// Hard-wrap text to a column width. Embedded newlines become line breaks;
// long words are split rather than overflowed.
export function wrapText(text: string, columns: number): string[] {
	const result: string[] = []
	const width = Math.max(1, columns)

	for (const paragraph of text.split('\n')) {
		if (paragraph.length === 0) {
			result.push('')
			continue
		}

		for (let start = 0; start < paragraph.length; start += width) {
			result.push(paragraph.slice(start, start + width))
		}
	}

	return result
}

export function insertChar(model: TerminalModel, ch: string): TerminalModel {
	const input = model.input.slice(0, model.caret) + ch + model.input.slice(model.caret)

	return { ...model, input, caret: model.caret + 1 }
}

export function backspace(model: TerminalModel): TerminalModel {
	if (model.caret <= 0) {
		return model
	}

	const input = model.input.slice(0, model.caret - 1) + model.input.slice(model.caret)

	return { ...model, input, caret: model.caret - 1 }
}

export function moveCaret(model: TerminalModel, delta: number): TerminalModel {
	return { ...model, caret: clamp(model.caret + delta, 0, model.input.length) }
}

export function caretHome(model: TerminalModel): TerminalModel {
	return { ...model, caret: 0 }
}

export function caretEnd(model: TerminalModel): TerminalModel {
	return { ...model, caret: model.input.length }
}

// Walk backwards through command history; the first press stashes the live
// draft so ArrowDown can bring it back.
export function historyBack(model: TerminalModel): TerminalModel {
	if (model.history.length === 0) {
		return model
	}

	const nextIndex = model.historyIndex === -1 ? model.history.length - 1 : Math.max(0, model.historyIndex - 1)
	const draft = model.historyIndex === -1 ? model.input : model.draft

	return {
		...model,
		draft,
		historyIndex: nextIndex,
		input: model.history[nextIndex] ?? model.input,
		caret: (model.history[nextIndex] ?? model.input).length,
	}
}

export function historyForward(model: TerminalModel): TerminalModel {
	if (model.historyIndex === -1) {
		return model
	}

	const nextIndex = model.historyIndex + 1

	if (nextIndex < model.history.length) {
		return {
			...model,
			historyIndex: nextIndex,
			input: model.history[nextIndex] ?? model.input,
			caret: (model.history[nextIndex] ?? model.input).length,
		}
	}

	return {
		...model,
		historyIndex: -1,
		input: model.draft,
		caret: model.draft.length,
	}
}

// Commit the current input: echo it, store it in history and clear the line.
export function submit(model: TerminalModel, columns = COLUMNS): { model: TerminalModel; input: string } {
	const input = model.input
	const history = [...model.history]

	if (input !== '' && (history.length === 0 || history[history.length - 1] !== input)) {
		history.push(input)
		if (history.length > HISTORY_LIMIT) {
			history.shift()
		}
	}

	const echoed = appendLines(model, [line(input, 'cmd')], columns)

	return {
		model: {
			...echoed,
			history,
			input: '',
			caret: 0,
			draft: '',
			historyIndex: -1,
		},
		input,
	}
}

export function clearScreen(model: TerminalModel): TerminalModel {
	return { ...model, lines: [], caret: 0 }
}

export function scrollUp(model: TerminalModel, amount = 3): TerminalModel {
	if (model.lines.length === 0) {
		return model
	}

	return { ...model, offset: Math.min(model.lines.length - 1, model.offset + amount) }
}

export function scrollDown(model: TerminalModel, amount = 3): TerminalModel {
	return { ...model, offset: Math.max(0, model.offset - amount) }
}

export function pageUp(model: TerminalModel): TerminalModel {
	return scrollUp(model, 12)
}

export function pageDown(model: TerminalModel): TerminalModel {
	return scrollDown(model, 12)
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value))
}