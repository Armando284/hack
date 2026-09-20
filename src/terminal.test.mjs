import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
	backspace,
	clearScreen,
	appendLines,
	freshTerminal,
	historyBack,
	historyForward,
	insertChar,
	line,
	moveCaret,
	pageDown,
	pageUp,
	submit,
	wrapText,
} from './terminal.ts'

test('wrapText splits long lines at the column width', () => {
	assert.deepEqual(wrapText('ABCDEFGHIJ', 4), ['ABCD', 'EFGH', 'IJ'])
})

test('wrapText honours embedded newlines', () => {
	assert.deepEqual(wrapText('abc\ndef', 10), ['abc', 'def'])
	assert.deepEqual(wrapText('abc\n\ndef', 10), ['abc', '', 'def'])
})

test('wrapText keeps empty and short lines', () => {
	assert.deepEqual(wrapText('', 5), [''])
	assert.deepEqual(wrapText('hi', 5), ['hi'])
})

test('insertChar types at the caret, not just the end', () => {
	let model = freshTerminal([])
	model = insertChar(model, 'a')
	model = insertChar(model, 'b')
	model = moveCaret(model, -1)
	model = insertChar(model, 'X')

	assert.equal(model.input, 'aXb')
	assert.equal(model.caret, 2)
})

test('backspace deletes left of the caret', () => {
	let model = freshTerminal([])
	model = insertChar(model, 'a')
	model = insertChar(model, 'b')
	model = backspace(model)

	assert.equal(model.input, 'a')
})

test('backspace at the start is a no-op', () => {
	const model = freshTerminal([])

	assert.equal(backspace(model).input, '')
})

test('submit echoes, stores history and clears the input', () => {
	let model = freshTerminal([])
	model = insertChar(model, 'scan')

	const { model: next, input } = submit(model)

	assert.equal(input, 'scan')
	assert.equal(next.input, '')
	assert.deepEqual(next.history, ['scan'])
	assert.ok(next.lines.some((entry) => entry.text === 'scan' && entry.kind === 'cmd'))
})

test('submit skips empty and repeated commands in history', () => {
	let model = freshTerminal([])

	let { model: next } = submit(model)
	assert.deepEqual(next.history, [])

	model = insertChar(next, 'status')
	const { model: second } = submit(model)
	const { model: third } = submit(second)

	assert.deepEqual(third.history, ['status'])
})

test('historyBack recalls the previous command and Forward restores the draft', () => {
	let model = freshTerminal([])
	model = insertChar(model, 'scan')
	const { model: a } = submit(model)
	model = insertChar(a, 'files')
	const { model: b } = submit(model)
	model = insertChar(b, 'partial')
	model = moveCaret(model, -3)

	const recalled = historyBack(model)
	assert.equal(recalled.input, 'files')

	const further = historyBack(recalled)
	assert.equal(further.input, 'scan')

	const forward = historyForward(further)
	assert.equal(forward.input, 'files')

	const restored = historyForward(forward)
	assert.equal(restored.input, 'partial')
})

test('history does not walk past the first entry', () => {
	let model = freshTerminal([])
	model = insertChar(model, 'scan')
	const { model: a } = submit(model)
	const atTop = historyBack(historyBack(a))

	assert.equal(atTop.input, 'scan')
})

test('appendLines wraps output and trims the tail', () => {
	const banner = freshTerminal([])

	const long = appendLines(banner, [line('A'.repeat(30))], 10)
	assert.equal(long.lines.length, 3)
	assert.ok(long.lines.every((entry) => entry.text.length <= 10))
})

test('a full history is capped', () => {
	let model = freshTerminal([])

	for (let index = 0; index < 80; index++) {
		model = insertChar(submit(model).model, `cmd${index}`)
	}

	assert.ok(model.history.length <= 60)
})

test('scrolling offsets from the bottom and clamps at zero', () => {
	let model = freshTerminal([])
	model = appendLines(model, [line('x')], 2)

	assert.equal(model.offset, 0)
	model = pageUp(model)
	model = pageUp(model)
	assert.ok(model.offset >= 0)
	assert.ok(model.offset < model.lines.length || model.lines.length === 0)

	const bottom = scrollToBottom(model)
	assert.equal(bottom.offset, 0)
})

test('clearScreen wipes committed lines but keeps input', () => {
	let model = freshTerminal([])
	model = appendLines(model, [line('hello')], 40)
	model = insertChar(model, 'x')
	model = clearScreen(model)

	assert.equal(model.lines.length, 0)
	assert.equal(model.input, 'x')
})

function scrollToBottom(model) {
	return pageDown(pageDown(pageDown(pageDown(pageDown(model)))))
}