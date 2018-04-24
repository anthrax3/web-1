'use strict';

const reAttributeName = /^!?[\w\-:$@]+\.?$/;
const braces = {
	'(': ')',
	'[': ']',
	'{': '}'
};
const reverseBraces = {
	')': '(',
	']': '[',
	'}': '{'
};

/**
 * Emmet abbreviation parsing mode
 */
export default function() {
	return {
		startState() {
			return {
				braces: [],
				attr: 0,
				quote: null,
				parseError: null
			};
		},
		token(stream, state) {
			// Handle braces first to exit text or attribute context as soon as possible
			if (stream.peek() in braces) {
				state.braces.push(stream.next());
				return 'bracket';
			} else if (stream.peek() in reverseBraces) {
				if (last(state.braces) === reverseBraces[stream.next()]) {
					state.braces.pop();
					return 'bracket';
				}

				return 'bracket error';
			}

			if (inAttribute(state)) {
				return parseAttribute(stream, state);
			}

			if (inText(state)) {
				return parseText(stream);
			}

			if (stream.eatWhile(ident)) {
				return 'tag';
			}

			const ch = stream.next();

			if (ch === '.') {
				stream.eatWhile(ident);
				return 'attribute class';
			}

			if (ch === '#') {
				stream.eatWhile(ident);
				return 'attribute id';
			}

			if (ch === '*') {
				stream.eatWhile(num);
				return 'number';
			}

			if (ch === '+' || ch === '>' || ch === '^' || ch === '/') {
				return 'operator';
			}

			return unexpectedCharacter(stream, state);
		}
	};
}

function ident(ch) {
	return /[a-z0-9-_$@!%:]/.test(ch);
}

function num(ch) {
	return /[0-9]/.test(ch);
}

function quote(ch) {
	return ch === '"' || ch === '\'';
}

function unquoted(ch) {
	return !quote(ch) && !/[\s=[\]]/.test(ch);
}

function inAttribute(state) {
	return last(state.braces) === '[';
}

function inText(state) {
	return last(state.braces) === '{';
}

/**
 * Consumes quoted string and returns parsed token name, if possible
 * @param {CodeMirror.StringStream} stream
 * @param {Object} state
 * @return {String}
 */
function consumeQuoted(stream, state) {
	if (quote(stream.peek())) {
		const start = stream.pos;
		const ch = stream.next();

		while (!stream.eol()) {
			if (stream.eat(ch)) {
				stream.start = start;
				return 'string';
			}

			stream.eat('\\'); // Skip escaped character, e.g. \"
			stream.next();
		}

		// If reached here then string has no closing quote
		state.parseError = {
			message: 'No matching closing quote',
			ch: start
		};

		return 'string error';
	}
}

/**
 * Consumes unquoted string and returns parsed token name, if possible
 * @param {CodeMirror.StringStream} stream
 * @param {Object} state
 * @return {String}
 */
function consumeUnquoted(stream) {
	const start = stream.pos;
	if (stream.eatWhile(unquoted)) {
		stream.start = start;
		return 'string-2';
	}
}

/**
 * Parse abbreviation attributes from given state: a value inside `[]`
 * @param {CodeMirror.StringStream} stream
 * @param {Object} state
 */
function parseAttribute(stream, state) {
	const attrValue = 'attribute-value';
	let token;

	if (!state.attr) {
		// No attribute state, expect name or implicit value
		if (stream.eatSpace()) {
			return null;
		}

		if (token = consumeQuoted(stream, state)) {
			// Consumed quoted value: anonymous attribute
			return `${token} ${attrValue}`;
		}

		if (token = consumeUnquoted(stream, state)) {
			// Consumed next word: could be either attribute name or unquoted default value
			if (reAttributeName.test(stream.current())) {
				// Attribute name
				state.attr++; // expect =
				return 'attribute attribute-name';
			}

			// Unquoted anonymous attribute
			return `${token} ${attrValue}`;
		}
	} else if (state.attr === 1) {
		if (stream.eat('=')) {
			state.attr++;
			return null;
		}

		// looks like next attribute
		state.attr = 0;
		return parseAttribute(stream, state);
	} else if (state.attr === 2) {
		// Expect attribute value after '='
		state.attr = 0;
		token = consumeQuoted(stream, state) || consumeUnquoted(stream, state);
		if (token) {
			return `${token} ${attrValue}`;
		}
	}

	// Unexpected state
	state.attr = 0;
	state.parseError = {
		message: 'Expected attribute value',
		ch: state.pos
	};
}

/**
 * Parse abbreviation text from given state: a value inside `{}`
 * @param {CodeMirror.StringStream} stream
 */
function parseText(stream) {
	let stack = 0, ch;

	while (!stream.eol()) {
		if (stream.peek() === '}' && stack <= 0) {
			// Reached the end of text value
			break;
		}

		ch = stream.next();
		if (ch === '{') {
			stack++;
		} else if (ch === '}') {
			stack--;
		} else if (ch === '\\') {
			stream.next();
		}
	}

	return 'text';
}

function unexpectedCharacter(stream, state) {
	if (!state.parseError) {
		state.parseError = {
			message: 'Unexpected character',
			ch: stream.pos
		};
	}

	while (!stream.eol()) {
		stream.next();
	}

	return 'error';
}

function last(arr) {
	return arr[arr.length - 1];
}
