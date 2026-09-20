// HACK.EXE — the run-level state machine: node, clearance, trace, score and
// the flags that record solved milestones. Immutable snapshots so the
// transitions stay trivially testable without any canvas or DOM.

export type GameStatus = 'title' | 'playing' | 'paused' | 'complete'

export type NodeId = 'gateway' | 'relay' | 'forge' | 'core'

export interface RunState {
	status: GameStatus
	node: NodeId
	level: number
	trace: number
	score: number
	hiScore: number
	flags: string[]
	newHi: boolean
}

export const MAX_TRACE = 100
export const MAX_LEVEL = 3

// Wrong actions bump the trace; the watchdogs cut the link at 100.
export const TRACE_STEP = 10

// A terminated link costs a little score and drops the operator to the
// gateway, but never erases puzzle progress.
export const TRACE_LOSS = 50

// Points awarded at the end of a clean run, shrinking as trace climbs.
export const CLEAN_BONUS = 300

export function freshSession(hiScore: number): RunState {
	return {
		status: 'title',
		node: 'gateway',
		level: 0,
		trace: 0,
		score: 0,
		hiScore,
		flags: [],
		newHi: false,
	}
}

export function startRun(session: RunState): RunState {
	const cleared = clearRun(session)

	return {
		...cleared,
		status: 'playing',
	}
}

// A fresh run keeps the persisted high score but drops every other value.
export function clearRun(session: RunState): RunState {
	return {
		status: 'playing',
		node: 'gateway',
		level: 0,
		trace: 0,
		score: 0,
		hiScore: session.hiScore,
		flags: [],
		newHi: false,
	}
}

export function toPaused(session: RunState): RunState {
	return { ...session, status: 'paused' }
}

export function toPlaying(session: RunState): RunState {
	return { ...session, status: 'playing' }
}

export function toTitle(session: RunState): RunState {
	return { ...session, status: 'title' }
}

export function toComplete(session: RunState): RunState {
	return { ...session, status: 'complete' }
}

export function addScore(session: RunState, points: number): RunState {
	const score = session.score + points
	const newHi = score > session.hiScore

	return {
		...session,
		score,
		hiScore: newHi ? score : session.hiScore,
		newHi: session.newHi || newHi,
	}
}

export function deductScore(session: RunState, points: number): RunState {
	return { ...session, score: Math.max(0, session.score - points) }
}

// Award points exactly once per named milestone.
export function awardOnce(session: RunState, flag: string, points: number): RunState {
	if (session.flags.includes(flag)) {
		return session
	}

	return addScore({ ...session, flags: [...session.flags, flag] }, points)
}

export function hasFlag(session: RunState, flag: string): boolean {
	return session.flags.includes(flag)
}

export function setLevel(session: RunState, level: number): RunState {
	return { ...session, level: Math.max(session.level, Math.min(MAX_LEVEL, level)) }
}

export function gotoNode(session: RunState, node: NodeId): RunState {
	return { ...session, node }
}

export function addTrace(session: RunState, delta: number): RunState {
	return {
		...session,
		trace: Math.max(0, Math.min(MAX_TRACE, session.trace + delta)),
	}
}