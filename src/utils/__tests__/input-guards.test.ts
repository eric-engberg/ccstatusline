import {
    describe,
    expect,
    it
} from 'vitest';

import {
    getInsertableText,
    getPlainInput,
    shouldInsertInput
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

describe('shouldInsertInput', () => {
    it('allows regular printable input without modifiers', () => {
        expect(shouldInsertInput('s', {})).toBe(true);
        expect(shouldInsertInput('S', { shift: true })).toBe(true);
    });

    it('blocks ctrl chords', () => {
        expect(shouldInsertInput('s', { ctrl: true })).toBe(false);
    });

    it('blocks meta chords', () => {
        expect(shouldInsertInput('s', { meta: true })).toBe(false);
    });

    it('blocks tab-based input', () => {
        expect(shouldInsertInput('\t', { tab: true })).toBe(false);
    });

    it('blocks control characters and allows unicode text', () => {
        expect(shouldInsertInput('\u0013', {})).toBe(false);
        expect(shouldInsertInput('🙂', {})).toBe(true);
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
    });

    it('inserts nothing for a lone line break or a paste with other control characters', () => {
        expect(getInsertableText('\n', {})).toBe('');
        expect(getInsertableText('\r\n', {})).toBe('');
        expect(getInsertableText('ab\u007F', {})).toBe('');
        // A bracketed paste, after Ink strips the leading ESC
        expect(getInsertableText('[200~abc\u001B[201~', {})).toBe('');
    });
});
