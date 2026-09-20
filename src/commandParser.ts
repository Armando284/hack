// HACK.EXE — the command parser. It only tokenizes and normalizes input; the
// command handlers in the world decide what each command is allowed to do.

export type ParsedLine =
	| { ok: true; command: string; args: string[] }
	| { ok: false; error: 'empty' | 'syntax' }

// Friendly aliases a terminal user might guess on their own.
const ALIASES: Record<string, string> = {
	'?': 'help',
	ls: 'files',
	cat: 'read',
	repair: 'disconnect',
}

export function parse(input: string): ParsedLine {
	const trimmed = input.trim()

	if (trimmed === '') {
		return { ok: false, error: 'empty' }
	}

	const tokens = trimmed.split(/\s+/)
	const raw = tokens[0]!.toLowerCase()
	const command = ALIASES[raw] ?? raw
	const args = tokens.slice(1)

	return { ok: true, command, args }
}