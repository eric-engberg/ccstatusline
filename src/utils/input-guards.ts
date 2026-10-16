export interface InputKeyLike {
    ctrl?: boolean;
    meta?: boolean;
    shift?: boolean;
    tab?: boolean;
}

const CONTROL_CHAR_REGEX = /[\u0000-\u001F\u007F]/u;
const LINE_BREAKS_REGEX = /[\r\n]+/u;
const TAB_REGEX = /\t/gu;
// How a copied code can start: #FF8800, 0xE0B4, U+E0B4
const HEX_PREFIX_REGEX = /^(?:#|0x|u\+)/iu;
const HEX_DIGITS_REGEX = /^[0-9a-f]+$/iu;

// Letter shortcuts compare against this rather than the raw input, so ctrl and
// alt/option combos never trigger the plain-letter action (macOS terminals send
// alt+← as ESC b, i.e. meta+b) and stay free for bindings of their own
export function getPlainInput(input: string, key: InputKeyLike): string {
    return key.ctrl || key.meta ? '' : input;
}

// The text a keypress or a paste adds to a single-line field, or '' for none.
// Ink hands over a paste as one input string, line breaks and tabs included:
// the breaks are dropped at the ends and become a space between lines, and
// tabs become spaces. Ctrl and alt chords and the Tab key add nothing (ctrl+s
// must not type an s), nor does input with any other control character, such
// as an escape sequence.
export function getInsertableText(input: string, key: InputKeyLike): string {
    if (key.ctrl || key.meta || key.tab) {
        return '';
    }

    const text = input
        .split(LINE_BREAKS_REGEX)
        .filter(line => line !== '')
        .join(' ')
        .replace(TAB_REGEX, ' ');
    return CONTROL_CHAR_REGEX.test(text) ? '' : text;
}

// The upper-cased digits a keypress or a paste adds to a hex prompt with room
// for `room` more, or '' when the input isn't a hex code that fits. A pasted
// code may carry one #, 0x or U+ prefix and surrounding whitespace.
export function getInsertableHexDigits(input: string, key: InputKeyLike, room: number): string {
    const digits = getInsertableText(input, key).trim().replace(HEX_PREFIX_REGEX, '');
    return HEX_DIGITS_REGEX.test(digits) && digits.length <= room ? digits.toUpperCase() : '';
}
