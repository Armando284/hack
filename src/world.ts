// HACK.EXE — the puzzle world. Everything the player discovers lives here:
// the four fictional nodes, their files, logs, gates and the rules that
// turn commands into progress. It owns the RunState snapshot and returns
// styled terminal lines plus the odd sound effect; it never draws anything.

import {
	MAX_TRACE,
	addTrace,
	awardOnce,
	deductScore,
	gotoNode,
	hasFlag,
	setLevel,
	toComplete,
	type NodeId,
	type RunState,
} from './session.ts'
import { line, type TermLine } from './terminal.ts'
import { traceBar } from './format.ts'

export const POINTS = {
	levelOne: 100,
	reachRelay: 150,
	keycard: 100,
	reachForge: 150,
	rune: 100,
	levelThree: 100,
	reachCore: 250,
	extract: 200,
} as const

export const FLAG_LEVEL_ONE = 'level1'
export const FLAG_REACH_RELAY = 'reach:relay'
export const FLAG_KEYCARD = 'keycard'
export const FLAG_REACH_FORGE = 'reach:forge'
export const FLAG_RUNE = 'rune'
export const FLAG_LEVEL_THREE = 'level3'
export const FLAG_REACH_CORE = 'reach:core'
export const FLAG_EXTRACT = 'extract'

const RELAY_BIAS = 4

export type SfxSoundName = 'accept' | 'deny' | 'unlock' | 'complete'

export interface ActionResult {
	lines: TermLine[]
	clear?: boolean
	sound?: SfxSoundName
	terminated?: boolean
}

interface NodeMeta {
	name: string
	label: string
}

const NODE_META: Record<NodeId, NodeMeta> = {
	gateway: { name: 'NODE-01', label: 'GATEWAY-ALPHA' },
	relay: { name: 'RELAY-07', label: 'UPLINK BRIDGE' },
	forge: { name: 'NODE-03', label: 'FORGE' },
	core: { name: 'CORE', label: 'DATA VAULT' },
}

interface FileDef {
	id: string
	name: string
	isLog?: boolean
	content: TermLine[]
}

const FILES: Record<NodeId, FileDef[]> = {
	gateway: [
		{
			id: 'manifest',
			name: 'manifest.sys',
			content: [
				line('GATEWAY MANIFEST v2.1', 'out'),
				line(''),
				line('services : watchdog, log-svc', 'out'),
				line('uplink   : RELAY-07', 'out'),
				line('gate     : operator pass @ LEVEL 1', 'out'),
				line(''),
				line('note     : operator events logged during fallback', 'dim'),
			],
		},
		{
			id: 'guardlog',
			name: 'guard.log',
			isLog: true,
			content: [
				line('[23:14] WATCHDOG ONLINE', 'dim'),
				line('[23:16] FALLBACK MODE ENABLED', 'dim'),
				line('[23:17] UPLINK GATE SET TO OPERATOR PASS', 'dim'),
				line('[23:18] OPERATOR ID  .... MERIDIAN', 'out'),
				line('[23:18] OPERATOR PASS .. VOIDHALO', 'out'),
			],
		},
	],
	relay: [
		{
			id: 'keycard',
			name: 'keycard.dat',
			content: [
				line('KEYCARD // SEALED', 'out'),
				line(''),
				line('holder   : courier', 'out'),
				line('field    : STIR', 'out'),
				line('note     : decode the field to open', 'dim'),
			],
		},
		{
			id: 'relaylog',
			name: 'relay.log',
			isLog: true,
			content: [
				line('[23:20] RELAY LINK SYNCED', 'dim'),
				line('[23:21] SHIFT BIAS SET TO 4', 'out'),
				line('[23:22] KEYCARD SEALED AT BIAS', 'dim'),
				line('[23:22] NODE-03 LOCK — KEYCARD ONLY', 'dim'),
			],
		},
	],
	forge: [
		{
			id: 'rune',
			name: 'rune.dat',
			content: [
				line('RUNE // ZEYPX', 'out'),
				line(''),
				line('note     : the CORE pass phrase needs this word', 'dim'),
			],
		},
		{
			id: 'noise',
			name: 'noise.dat',
			content: [
				line('NOISE // STIR', 'out'),
				line(''),
				line('note     : this is not the rune', 'dim'),
			],
		},
		{
			id: 'forgelog',
			name: 'forge.log',
			isLog: true,
			content: [
				line('[23:30] FORGE SEALS THE CORE RUNE', 'dim'),
				line('[23:31] RUNE ENCODED AT SHIFT BIAS 4', 'out'),
				line('[23:31] DECOY NOISE FIELD SEEDED', 'dim'),
				line('[23:31] CORE PASS = <RELAY WORD><FORGE WORD>', 'out'),
			],
		},
	],
	core: [],
}

const FILE_TREE: Record<NodeId, string[]> = {
	gateway: ['/SYSTEM', '    manifest.sys', '', '/LOGS', '    guard.log'],
	relay: ['/KEYS', '    keycard.dat', '', '/LOGS', '    relay.log'],
	forge: ['/DATA', '    rune.dat', '    noise.dat', '', '/LOGS', '    forge.log'],
	core: ['/CORE', '    ( the data core awaits )'],
}

export class World {
	state: RunState

	constructor(initial: RunState) {
		this.state = initial
	}

	// ---- dispatch ------------------------------------------------------

	execute(command: string, args: string[]): ActionResult {
		const result = this.dispatch(command, args)

		if (result.clear || this.state.status === 'complete') {
			return result
		}

		if (this.state.trace >= MAX_TRACE) {
			return this.terminate()
		}

		return result
	}

	private dispatch(command: string, args: string[]): ActionResult {
		switch (command) {
			case 'help':
				return this.help(args)
			case 'clear':
				return { clear: true, lines: [] }
			case 'status':
				return { lines: this.nodeStatus() }
			case 'scan':
				return { lines: this.networkView() }
			case 'inspect':
				return this.inspect(args)
			case 'files':
				return { lines: this.fileTree() }
			case 'read':
				return this.readFile(args)
			case 'logs':
				return { lines: this.nodeLog() }
			case 'decode':
				return this.decode(args)
			case 'auth':
				return this.auth(args)
			case 'connect':
				return this.connect(args)
			case 'disconnect':
				return this.disconnect()
			case 'trace':
				return { lines: this.traceMonitor() }
			case 'extract':
				return this.extract()
			default:
				return { lines: [line('UNKNOWN COMMAND — TYPE `help`', 'err')] }
		}
	}

	// ---- help ----------------------------------------------------------

	private help(args: string[]): ActionResult {
		if (args.length > 0) {
			return { lines: [this.describeCommand(args[0]!)] }
		}

		const lines: TermLine[] = [
			line('-- HELP -------------------------------', 'head'),
			line('CLEAR....... wipe the screen', 'dim'),
			line('STATUS...... current node status', 'dim'),
			line('SCAN........ ports and reachable nodes', 'dim'),
			line('INSPECT..... examine a target', 'dim'),
			line('FILES....... list files in this node', 'dim'),
			line('READ........ read a file', 'dim'),
			line('LOGS........ tail the node log', 'dim'),
			line('AUTH........ authenticate to a gate', 'dim'),
			line('CONNECT..... travel to a node in view', 'dim'),
			line('DISCONNECT.. return to the gateway', 'dim'),
			line('TRACE....... show the detection meter', 'dim'),
		]

		if (hasFlag(this.state, FLAG_REACH_RELAY)) {
			lines.push(line('DECODE...... decode an encoded field', 'dim'))
		}

		if (this.state.node === 'core') {
			lines.push(line('EXTRACT..... seize the data core', 'dim'))
		}

		lines.push(line(''), line(this.nodeTip(), 'sys'), line('----------------------------------------', 'head'))

		return { lines }
	}

	private describeCommand(command: string): TermLine {
		const descriptions: Record<string, string> = {
			help: 'HELP — a listing of available commands',
			clear: 'CLEAR — wipe the terminal screen',
			status: 'STATUS — the current node, clearance and meter',
			scan: 'SCAN — ports, services and reachable nodes',
			inspect: 'INSPECT <TARGET> — examine a service or node',
			files: 'FILES — list the files stored in this node',
			read: 'READ <FILE> — show a file from this node',
			logs: 'LOGS — tail the current node log',
			auth: 'AUTH <ID> <PASS> — authenticate to a locked gate',
			connect: 'CONNECT <NODE> — travel to a node in view',
			disconnect: 'DISCONNECT — return to the gateway',
			trace: 'TRACE — show the detection meter',
			decode: 'DECODE <FIELD> SHIFT-<N> — shift-encoded fields',
			extract: 'EXTRACT — seize the data core (CORE only)',
		}

		return line(descriptions[command.toLowerCase()] ?? 'UNKNOWN COMMAND — TYPE `help`', 'dim')
	}

	private nodeTip(): string {
		switch (this.state.node) {
			case 'gateway':
				return 'TIP — inspect the local services and read the logs.'
			case 'relay':
				return 'TIP — encoded fields need the decoder. Find the shift bias.'
			case 'forge':
				return 'TIP — not every file is what it claims to be.'
			case 'core':
				return 'TIP — the data core is secured. Type `extract` to seize it.'
		}
	}

	// ---- status / scan ------------------------------------------------

	private nodeStatus(): TermLine[] {
		const meta = NODE_META[this.state.node]
		const access = this.state.node === 'core' ? 'ROOT' : this.accessWord()
		const security = this.state.node === 'core' ? 'BY-PASSED' : 'ACTIVE'

		return [
			line('-- STATUS ------------------------------', 'head'),
			line(`SYSTEM   : ${meta.name} // ${meta.label}`, 'out'),
			line(`UPTIME   : 083:17:02`, 'out'),
			line(`ACCESS   : ${access}`, 'out'),
			line(`CLEARANCE: LEVEL ${this.state.level}`, 'out'),
			line(`SECURITY : ${security}`, 'out'),
			line(`TRACE    : ${traceBar(this.state.trace)} ${this.state.trace}%`, 'out'),
			line('----------------------------------------', 'head'),
		]
	}

	private accessWord(): string {
		switch (this.state.level) {
			case 0:
				return 'GUEST'
			case 1:
				return 'OPERATOR'
			case 2:
				return 'OPERATOR'
			default:
				return 'CLEARED'
		}
	}

	private networkView(): TermLine[] {
		const lines: TermLine[] = [line('-- NETWORK VIEW -------------------------', 'head')]

		switch (this.state.node) {
			case 'gateway':
				lines.push(
					line('LOCAL SERVICES', 'dim'),
					line('  WATCHDOG ..... gateway daemon', 'out'),
					line('  LOG-SVC ...... event archive', 'out'),
					line(''),
					line('REACHABLE NODES', 'dim'),
					line('  RELAY-07 ..... [LOCKED] operator pass @ LEVEL 1', 'sys'),
				)
				break
			case 'relay':
				lines.push(
					line('PORTS', 'dim'),
					line('  22 ....... TUNNEL [OPEN]', 'out'),
					line('  77 ....... MIRROR [OPEN]', 'out'),
					line('  443 ...... SHROUD [FILTERED]', 'out'),
					line(''),
					line('REACHABLE NODES', 'dim'),
					line('  GATEWAY .... NODE-01', 'sys'),
					line('  NODE-03 .... [LOCKED] keycard required', 'sys'),
				)
				break
			case 'forge':
				lines.push(
					line('PORTS', 'dim'),
					line('  22 ....... TUNNEL [OPEN]', 'out'),
					line('  77 ....... MIRROR [OPEN]', 'out'),
					line('  443 ...... SHROUD [OPEN]', 'out'),
					line(''),
					line('LOCAL SERVICES', 'dim'),
					line('  SPOOLER .... forge monitor', 'out'),
					line(''),
					line('REACHABLE NODES', 'dim'),
					line('  GATEWAY .... NODE-01', 'sys'),
					line('  RELAY-07 ... open', 'sys'),
					line('  CORE ....... [LOCKED] LEVEL 3 + pass phrase', 'sys'),
				)
				break
			case 'core':
				lines.push(
					line('LOCAL SERVICES', 'dim'),
					line('  DATA-CORE ... sealed vault', 'out'),
					line(''),
					line('REACHABLE NODES', 'dim'),
					line('  GATEWAY .... NODE-01', 'sys'),
					line('  RELAY-07 ... open', 'sys'),
					line('  NODE-03 .... open', 'sys'),
				)
				break
		}

		lines.push(line('----------------------------------------', 'head'))
		return lines
	}

	// ---- files ---------------------------------------------------------

	private fileTree(): TermLine[] {
		return [
			line('-- FILES -------------------------------', 'head'),
			...FILE_TREE[this.state.node].map((entry) => line(entry, 'out')),
			line('----------------------------------------', 'head'),
		]
	}

	private resolveFile(name: string): FileDef | undefined {
		const wanted = collapse(name)
		return FILES[this.state.node].find(
			(file) => collapse(file.name) === wanted || file.name.toLowerCase() === name.toLowerCase(),
		)
	}

	private readFile(args: string[]): ActionResult {
		if (args.length === 0) {
			return { lines: [line('READ WHAT? — TRY `files` THEN `read <FILE>`', 'err')] }
		}

		const file = this.resolveFile(args.join(' '))
		if (!file) {
			return { lines: [line('NO SUCH FILE IN THIS NODE — TRY `files`', 'err')] }
		}

		return {
			lines: [line(`-- ${file.name} -------------------------`, 'head'), ...file.content, line('----------------------------------------', 'head')],
		}
	}

	private nodeLog(): TermLine[] {
		const log = FILES[this.state.node].find((file) => file.isLog)

		if (!log) {
			return [line('NO ARCHIVE AT THIS NODE', 'dim')]
		}

		return [line('-- LOGS --------------------------------', 'head'), ...log.content, line('----------------------------------------', 'head')]
	}

	// ---- inspect -------------------------------------------------------

	private inspect(args: string[]): ActionResult {
		if (args.length === 0) {
			return { lines: [line('INSPECT WHAT? — TRY `scan`', 'err')] }
		}

		const target = collapse(args.join(' '))
		const meta = NODE_META[this.state.node]

		if (target === collapse(meta.name) || target === collapse(meta.label)) {
			return { lines: this.nodeStatus() }
		}

		const lines = this.inspectTarget(target)
		return lines ? { lines } : { lines: [line('NO SUCH TARGET — TRY `scan`', 'err')] }
	}

	private inspectTarget(target: string): TermLine[] | null {
		switch (this.state.node) {
			case 'gateway':
				if (target === 'watchdog') {
					return [
						line('WATCHDOG — gateway daemon', 'head'),
						line(''),
						line('Guards the uplink to RELAY-07. Operator credentials', 'out'),
						line('were rotated during fallback mode. The event archive', 'out'),
						line('under /LOGS may hold them.', 'out'),
						line('', 'out'),
						line('Try `files` then `read <FILE>`.', 'dim'),
						line('----------------------------------------', 'head'),
					]
				}
				if (target === 'logsvc' || target === 'log') {
					return [
						line('LOG-SVC — event archive', 'head'),
						line(''),
						line('Archives system events under /LOGS. Read entries', 'out'),
						line('with `read <FILE>`.', 'out'),
						line('----------------------------------------', 'head'),
					]
				}
				if (target === 'relay07' || target === 'relay' || target === 'relay7') {
					return [
						line('RELAY-07 — uplink bridge', 'head'),
						line(''),
						line('Locked. Accepts only an OPERATOR ID + PASS on the', 'out'),
						line('watchdog gate. Clearance LEVEL 1 required.', 'out'),
						line('----------------------------------------', 'head'),
					]
				}
				if (target === 'core') {
					return [line('CORE IS NOT IN VIEW FROM THE GATEWAY — TRY `scan`', 'warn')]
				}
				return null

			case 'relay':
				if (target === 'keycard' || target === 'key') {
					return [
						line('KEYCARD — /KEYS', 'head'),
						line(''),
						line('Sealed. Its slot holds an encoded field that the', 'out'),
						line('decoder can open.', 'out'),
						line('----------------------------------------', 'head'),
					]
				}
				if (target === 'relay07' || target === 'relay' || target === 'relay7') {
					return [
						line('RELAY-07 — uplink bridge', 'head'),
						line(''),
						line('Bridges onward to NODE-03. The shroud on port 443', 'out'),
						line('keeps the CORE traffic hidden from here.', 'out'),
						line('----------------------------------------', 'head'),
					]
				}
				if (target === 'node03' || target === 'forge') {
					return [
						line('NODE-03 — FORGE', 'head'),
						line(''),
						line('Locked. Accepts only an OPENED keycard.', 'out'),
						line('----------------------------------------', 'head'),
					]
				}
				if (target === 'gateway' || target === 'node01') {
					return [line('The bridge back to the gateway is open.', 'dim')]
				}
				if (target === 'mirror') {
					return [line('MIRROR — echoes the keycard slot.', 'dim')]
				}
				if (target === 'tunnel') {
					return [line('TUNNEL — transport between nodes.', 'dim')]
				}
				if (target === 'shroud') {
					return [line('SHROUD — filtered here; CORE traffic hides behind it.', 'dim')]
				}
				return null

			case 'forge':
				if (target === 'core') {
					return [
						line('CORE — data vault', 'head'),
						line(''),
						line('Sealed. Requires LEVEL 3 clearance and a pass', 'out'),
						line('phrase built from the worlds you decoded:', 'out'),
						line('', 'out'),
						line('  <RELAY WORD><FORGE WORD>', 'warn'),
						line('', 'out'),
						line('The forge log names the pieces.', 'dim'),
						line('----------------------------------------', 'head'),
					]
				}
				if (target === 'spooler') {
					return [
						line('SPOOLER — forge monitor', 'head'),
						line(''),
						line('Watches the forge and records which fields are', 'out'),
						line('live. Its log marks the decoy noise file.', 'out'),
						line('----------------------------------------', 'head'),
					]
				}
				if (target === 'rune') {
					return [
						line('RUNE.dat — /DATA', 'head'),
						line(''),
						line('The true field. Encoded at the shift bias.', 'out'),
						line('----------------------------------------', 'head'),
					]
				}
				if (target === 'noise') {
					return [
						line('NOISE.dat — /DATA', 'head'),
						line(''),
						line('A seeded decoy. Ignore it.', 'out'),
						line('----------------------------------------', 'head'),
					]
				}
				if (target === 'node03' || target === 'forge') {
					return [line('You are here.', 'dim')]
				}
				if (target === 'gateway' || target === 'node01' || target === 'relay07' || target === 'relay') {
					return [line('The bridge back is open.', 'dim')]
				}
				return null

			case 'core':
				if (target === 'datacore' || target === 'core' || target === 'data') {
					return [
						line('DATA CORE — root vault', 'head'),
						line(''),
						line('The prize of the NIGHTFALL network. Type', 'out'),
						line('`extract` to seize it.', 'out'),
						line('----------------------------------------', 'head'),
					]
				}
				if (target === 'gateway' || target === 'node01' || target === 'relay07' || target === 'relay' || target === 'node03' || target === 'forge') {
					return [line('That node is behind you. The vault is ahead.', 'dim')]
				}
				return null
		}
	}

	// ---- decode --------------------------------------------------------

	private decode(args: string[]): ActionResult {
		if (!hasFlag(this.state, FLAG_REACH_RELAY)) {
			return { lines: [line('DECODER MODULE NOT LOADED — REACH RELAY-07', 'err')] }
		}

		const methodIndex = args.findIndex((token) => /^SHIFT-?\d+$/i.test(token))
		const text = methodIndex === -1 ? (args.length > 0 ? args.join(' ') : '') : args.filter((_, index) => index !== methodIndex).join(' ')

		if (text === '') {
			return { lines: [line('DECODE WHAT? — TRY `decode <FIELD> SHIFT-<N>`', 'err')] }
		}

		if (methodIndex === -1) {
			return { lines: [line('METHOD REQUIRED — TRY `decode <FIELD> SHIFT-<N>`', 'err')] }
		}

		const shift = Number(args[methodIndex]!.replace(/SHIFT-?/i, ''))
		const field = text.toUpperCase()
		const plain = caesar(field, shift)

		if (this.state.node === 'relay') {
			if (field === 'STIR') {
				if (shift === RELAY_BIAS) {
					this.state = awardOnce(this.state, FLAG_KEYCARD, POINTS.keycard)
					return {
						lines: [
							line('DECODING ...', 'dim'),
							line(`FIELD DECODED: ${plain}`, 'ok'),
							line(''),
							line('KEYCARD UNSEALED', 'ok'),
							line('NODE-03 WILL NOW ACCEPT IT', 'dim'),
							line('----------------------------------------', 'head'),
						],
						sound: 'accept',
					}
				}
				return { lines: [line('OUTPUT UNINTELLIGIBLE — TRY ANOTHER SHIFT', 'out')] }
			}
			return { lines: [line('UNRECOGNIZED FIELD', 'warn')] }
		}

		if (this.state.node === 'forge') {
			if (field === 'ZEYPX') {
				if (shift === RELAY_BIAS) {
					this.state = awardOnce(this.state, FLAG_RUNE, POINTS.rune)
					return {
						lines: [
							line('DECODING ...', 'dim'),
							line(`FIELD DECODED: ${plain}`, 'ok'),
							line(''),
							line('CORE RUNE SECURED', 'ok'),
							line('--- THE RUNE IS HALF THE CORE PASS ---', 'dim'),
							line('----------------------------------------', 'head'),
						],
						sound: 'accept',
					}
				}
				return { lines: [line('OUTPUT UNINTELLIGIBLE — TRY ANOTHER SHIFT', 'out')] }
			}

			if (field === 'STIR' && shift === RELAY_BIAS) {
				return this.bust(12, 'FIELD MATCHES THE RELAY KEYCARD — DECOY SEEDED — IGNORE IT')
			}

			return { lines: [line('LESS THAN MEETS THE EYE — CHECK /LOGS', 'out')] }
		}

		return { lines: [line('DECODER REDUNDANT AT THE CORE', 'dim')] }
	}

	// ---- auth ----------------------------------------------------------

	private auth(args: string[]): ActionResult {
		if (args.length < 2) {
			return { lines: [line('AUTH WHAT? — TRY `auth <ID> <PASS>`', 'err')] }
		}

		const id = collapse(args[0]!)
		const pass = args.slice(1).join('').toLowerCase()

		if (this.state.node === 'gateway') {
			if (id === 'core') {
				return { lines: [line('CORE UPLINK NOT IN VIEW — TRY `scan`', 'warn')] }
			}

			if (id === 'meridian') {
				if (pass === 'voidhalo') {
					if (hasFlag(this.state, FLAG_LEVEL_ONE)) {
						return { lines: [line('GATE ALREADY OPEN — LEVEL 1', 'ok')] }
					}
					this.state = setLevel(awardOnce(this.state, FLAG_LEVEL_ONE, POINTS.levelOne), 1)
					return {
						lines: [
							line('VERIFYING ...', 'dim'),
							line('OPERATOR VERIFIED — CLEARANCE LEVEL 1', 'ok'),
							line('RELAY-07 UPLINK UNLOCKED', 'ok'),
							line('----------------------------------------', 'head'),
						],
						sound: 'accept',
					}
				}
				return this.bust(10, 'DENIED — INVALID PASS')
			}

			return this.bust(5, 'UNKNOWN OPERATOR')
		}

		if (this.state.node === 'forge' && id === 'core') {
			if (pass === 'openvault') {
				if (hasFlag(this.state, FLAG_LEVEL_THREE)) {
					return { lines: [line('GATE ALREADY OPEN — LEVEL 3', 'ok')] }
				}
				this.state = setLevel(awardOnce(this.state, FLAG_LEVEL_THREE, POINTS.levelThree), 3)
				return {
					lines: [
						line('VERIFYING ...', 'dim'),
						line('CORE PASS PHRASE ACCEPTED — LEVEL 3', 'ok'),
						line('CORE UPLINK UNLOCKED', 'ok'),
						line('----------------------------------------', 'head'),
					],
					sound: 'accept',
				}
			}

			return this.bust(10, 'DENIED — CORE PASS INVALID')
		}

		return { lines: [line('NO GATE SERVICE AT THIS NODE', 'dim')] }
	}

	// ---- connect -------------------------------------------------------

	private connect(args: string[]): ActionResult {
		if (args.length === 0) {
			return { lines: [line('CONNECT WHERE? — TRY `scan`', 'err')] }
		}

		const target = collapse(args.join(' '))
		const node = this.state.node
		const here = NODE_META[node]

		if (target === node || target === collapse(here.name)) {
			return { lines: [line(`ALREADY AT ${here.name}`, 'dim')] }
		}

		if (node === 'gateway') {
			if (target === 'gateway' || target === 'node01' || target === 'node1' || target === 'gatewayalpha') {
				return { lines: [line('ALREADY AT THE GATEWAY', 'dim')] }
			}
			if (target === 'relay07' || target === 'relay' || target === 'relay7') {
				if (!hasFlag(this.state, FLAG_LEVEL_ONE)) {
					return this.bust(5, 'ACCESS DENIED — WATCHDOG: OPERATOR PASS REQUIRED')
				}
				return this.travel('relay')
			}
			return this.notInView(target)
		}

		if (node === 'relay') {
			if (target === 'gateway' || target === 'node01' || target === 'node1') {
				return this.travel('gateway')
			}
			if (target === 'node03' || target === 'forge') {
				if (!hasFlag(this.state, FLAG_KEYCARD)) {
					return this.bust(5, 'ACCESS DENIED — NODE-03 LOCK: KEYCARD SEALED')
				}
				return this.travel('forge')
			}
			if (target === 'core') {
				return { lines: [line('CORE NOT IN VIEW FROM RELAY — TRY `scan`', 'warn')] }
			}
			return this.notInView(target)
		}

		if (node === 'forge') {
			if (target === 'gateway' || target === 'node01' || target === 'node1') {
				return this.travel('gateway')
			}
			if (target === 'relay07' || target === 'relay' || target === 'relay7') {
				return this.travel('relay')
			}
			if (target === 'core') {
				if (this.state.level < 3) {
					return this.bust(5, 'ACCESS DENIED — REQUIRED CLEARANCE: LEVEL 3')
				}
				return this.travel('core')
			}
			return this.notInView(target)
		}

		if (node === 'core') {
			if (target === 'gateway' || target === 'node01' || target === 'node1' || target === 'relay07' || target === 'relay' || target === 'node03' || target === 'forge') {
				return this.travel('gateway')
			}
			return this.notInView(target)
		}

		return this.notInView(target)
	}

	private notInView(target: string): ActionResult {
		const known = ['gateway', 'relay', 'forge', 'core', 'node01', 'node03', 'relay07']

		if (known.includes(target)) {
			return { lines: [line('NODE NOT IN VIEW — TRY `scan`', 'warn')] }
		}

		return { lines: [line('NO SUCH NODE — TRY `scan`', 'err')] }
	}

	private travel(next: NodeId): ActionResult {
		const points = this.travelPoints(next)
		this.state = gotoNode(this.state, next)

		if (next === 'relay') {
			this.state = setLevel(this.state, 2)
		}

		if (points) {
			this.state = awardOnce(this.state, points.flag, points.score)
		}

		return { lines: this.arrival(next), sound: 'unlock' }
	}

	private travelPoints(node: NodeId): { flag: string; score: number } | null {
		switch (node) {
			case 'relay':
				return { flag: FLAG_REACH_RELAY, score: POINTS.reachRelay }
			case 'forge':
				return { flag: FLAG_REACH_FORGE, score: POINTS.reachForge }
			case 'core':
				return { flag: FLAG_REACH_CORE, score: POINTS.reachCore }
			default:
				return null
		}
	}

	arrival(node: NodeId): TermLine[] {
		const meta = NODE_META[node]
		const lines: TermLine[] = [
			line(`-- UPLINK // ${meta.name} -------------------`, 'head'),
			line(`LINK ESTABLISHED — ${meta.name} // ${meta.label}`, 'sys'),
			line(''),
		]

		switch (node) {
			case 'gateway':
				lines.push(line('TERMINAL READY — GUEST ACCESS', 'sys'))
				break
			case 'relay':
				lines.push(line('DECODER MODULE LOADED', 'ok'), line('NEW COMMAND: `decode`', 'ok'))
				break
			case 'forge':
				lines.push(line('RUNE FORGE ACTIVE', 'sys'), line('SOME FILES ARE NOT WHAT THEY CLAIM', 'warn'))
				break
			case 'core':
				lines.push(line('ROOT ACCESS', 'ok'), line('NEW COMMAND: `extract`', 'ok'))
				break
		}

		lines.push(line(''), line('TYPE `help` FOR AVAILABLE COMMANDS', 'dim'), line('----------------------------------------', 'head'))
		return lines
	}

	// ---- disconnect ----------------------------------------------------

	private disconnect(): ActionResult {
		if (this.state.node === 'gateway') {
			return { lines: [line('ALREADY AT THE GATEWAY', 'dim')] }
		}

		this.state = gotoNode(this.state, 'gateway')
		return {
			lines: [line('DROPPING TO THE GATEWAY ...', 'dim'), ...this.arrival('gateway')],
			sound: 'unlock',
		}
	}

	// ---- trace / extract ----------------------------------------------

	private traceMonitor(): TermLine[] {
		return [
			line('-- TRACE MONITOR -------------------------', 'head'),
			line(`TRACE ..... ${traceBar(this.state.trace)} ${this.state.trace}%`, 'out'),
			line(''),
			line('Wrong actions raise the meter. At 100% the link', 'dim'),
			line('terminates and the gateway catches you.', 'dim'),
			line('----------------------------------------', 'head'),
		]
	}

	private extract(): ActionResult {
		if (this.state.node !== 'core') {
			return { lines: [line('EXTRACT MOUNT NOT AVAILABLE — REACH THE CORE', 'err')] }
		}

		const bonus = Math.max(0, 300 - this.state.trace)
		const total = POINTS.extract + bonus
		this.state = awardOnce(this.state, FLAG_EXTRACT, total)
		this.state = toComplete(this.state)

		return {
			lines: [
				line('-- EXTRACTION ----------------------------', 'head'),
				line('DATA CORE RESPONDS', 'sys'),
				line('SEAL BROKEN — SECTOR BY SECTOR', 'sys'),
				line(''),
				line('DATA CORE SECURED', 'ok'),
				line(`MISSION TIME-LOG FROZEN — SCORE +${total}`, 'ok'),
				line('----------------------------------------', 'head'),
			],
			sound: 'complete',
		}
	}

	// ---- termination ---------------------------------------------------

	private bust(delta: number, message: string): ActionResult {
		this.state = addTrace(this.state, delta)
		const next = this.state.trace

		return {
			lines: [
				line(message, 'err'),
				line(`TRACE RISING — ${next}%`, 'warn'),
			],
			sound: 'deny',
		}
	}

	private terminate(): ActionResult {
		const loss = Math.min(50, this.state.score)
		this.state = gotoNode(this.state, 'gateway')
		this.state = addTrace(this.state, -100)
		this.state = deductScore(this.state, loss)

		return {
			lines: [
				line('!! CONNECTION TERMINATED — WATCHDOG LOCKON !!', 'err'),
				line('LINK BURNED — REROUTED TO THE GATEWAY', 'sys'),
				line(`TRACE FULL — SCORE -${loss}`, 'warn'),
				line(''),
				line('PUZZLE PROGRESS PRESERVED. TRY AGAIN.', 'dim'),
			],
			sound: 'complete',
			terminated: true,
		}
	}
}

// ---- decoding helper --------------------------------------------------

// Simple Caesar shift for the fictional fields. The ciphertext is the
// plaintext shifted FORWARD by `shift`; decoding walks it back.
function caesar(text: string, shift: number): string {
	const amount = ((shift % 26) + 26) % 26
	let result = ''

	for (const ch of text) {
		if (/[A-Z]/.test(ch)) {
			const code = ((ch.charCodeAt(0) - 65 - amount + 26) % 26) + 65
			result += String.fromCharCode(code)
		} else {
			result += ch
		}
	}

	return result
}

// Collapse a target name to a searchable key: lower case, alphanumeric only.
function collapse(value: string): string {
	return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}