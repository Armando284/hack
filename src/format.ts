// HACK.EXE — small pure formatting helpers used by the HUD and the trace bar.

// Zero-pad an integer so the arcade HUD always shows fixed-width values.
export function pad(value: number, width = 6): string {
	return String(Math.floor(value)).padStart(width, '0')
}

// Render the trace meter as ten filled/empty blocks.
export function traceBar(trace: number): string {
	const normalized = Math.max(0, Math.min(100, trace))
	const filled = Math.round(normalized / 10)
	return '█'.repeat(filled) + '░'.repeat(10 - filled)
}

// Repeat a glyph n times, guarding against values below zero.
export function repeat(glyph: string, count: number): string {
	return glyph.repeat(Math.max(0, count))
}