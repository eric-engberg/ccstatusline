import {
    describe,
    expect,
    it
} from 'vitest';

import {
    getInsertableHexDigits,
    getInsertableText,
    getPlainInput
} from '../input-guards';

describe('getPlainInput', () => {
    it('passes bare keypresses through, shifted ones included', () => {
        expect(getPlainInput('d', {})).toBe('d');
        expect(getPlainInput('D', { shift: true })).toBe('D');
        expect(getPlainInput(' ', {})).toBe(' ');
    });

    it('hides the letter while ctrl or alt/option (meta) is held', () => {
        expect(getPlainInput('d', { ctrl: true })).toBe('');
        expect(getPlainInput('d', { meta: true })).toBe('');
        expect(getPlainInput('d', { ctrl: true, meta: true })).toBe('');
    });
});

describe('getInsertableText', () => {
    it('allows regular printable input without modifiers', () => {
        expect(getInsertableText('s', {})).toBe('s');
        expect(getInsertableText('S', { shift: true })).toBe('S');
    });

    it('blocks ctrl chords', () => {
        expect(getInsertableText('s', { ctrl: true })).toBe('');
    });

    it('blocks meta chords', () => {
        expect(getInsertableText('s', { meta: true })).toBe('');
    });

    it('blocks tab-based input', () => {
        expect(getInsertableText('\t', { tab: true })).toBe('');
    });

    it('blocks control characters and allows unicode text', () => {
        expect(getInsertableText('\u0013', {})).toBe('');
        expect(getInsertableText('🙂', {})).toBe('🙂');
    });

    // Ink hands a paste over as one input string, line breaks and tabs included
    it('keeps a pasted line without its trailing line break', () => {
        expect(getInsertableText('npx ccusage statusline\r', {})).toBe('npx ccusage statusline');
        expect(getInsertableText('npx ccusage statusline\r\n', {})).toBe('npx ccusage statusline');
        expect(getInsertableText('\nnpx ccusage statusline\n', {})).toBe('npx ccusage statusline');
    });

    it('joins pasted lines with a space and turns pasted tabs into spaces', () => {
        expect(getInsertableText('line1\rline2', {})).toBe('line1 line2');
        expect(getInsertableText('line1\r\n\r\nline2', {})).toBe('line1 line2');
        expect(getInsertableText('echo\thi', {})).toBe('echo hi');
        expect(getInsertableText('a\tb\t\tc', {})).toBe('a b  c');
    });

    it('inserts nothing for a lone line break or a paste with other control characters', () => {
        expect(getInsertableText('\n', {})).toBe('');
        expect(getInsertableText('\r\n', {})).toBe('');
        expect(getInsertableText('ab\u007F', {})).toBe('');
        // A bracketed paste, after Ink strips the leading ESC
        expect(getInsertableText('[200~abc\u001B[201~', {})).toBe('');
    });
});

describe('getInsertableHexDigits', () => {
    it('upper-cases a typed hex digit and ignores other keys', () => {
        expect(getInsertableHexDigits('a', {}, 6)).toBe('A');
        expect(getInsertableHexDigits('7', {}, 6)).toBe('7');
        expect(getInsertableHexDigits('g', {}, 6)).toBe('');
        expect(getInsertableHexDigits('#', {}, 6)).toBe('');
        expect(getInsertableHexDigits(' ', {}, 6)).toBe('');
    });

    it('blocks chords and digits past the room left', () => {
        expect(getInsertableHexDigits('a', { ctrl: true }, 6)).toBe('');
        expect(getInsertableHexDigits('a', { meta: true }, 6)).toBe('');
        expect(getInsertableHexDigits('a', {}, 0)).toBe('');
    });

    it('takes a pasted code whole, without its prefix, spaces or line break', () => {
        expect(getInsertableHexDigits('ff8800', {}, 6)).toBe('FF8800');
        expect(getInsertableHexDigits('#FF8800', {}, 6)).toBe('FF8800');
        expect(getInsertableHexDigits(' #FF8800 \r', {}, 6)).toBe('FF8800');
        expect(getInsertableHexDigits('U+E0B4', {}, 6)).toBe('E0B4');
        expect(getInsertableHexDigits('u+1f984', {}, 6)).toBe('1F984');
        expect(getInsertableHexDigits('0xE0B4', {}, 6)).toBe('E0B4');
    });

    it('ignores a paste that is not a hex code or does not fit', () => {
        expect(getInsertableHexDigits('E0G4', {}, 6)).toBe('');
        expect(getInsertableHexDigits('uniE0B4', {}, 6)).toBe('');
        expect(getInsertableHexDigits('rgb(255, 136, 0)', {}, 6)).toBe('');
        expect(getInsertableHexDigits('#', {}, 6)).toBe('');
        expect(getInsertableHexDigits('FF8800', {}, 4)).toBe('');
    });
});
