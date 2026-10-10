import {
    describe,
    expect,
    it
} from 'vitest';

import { getVisibleWidth } from '../../../utils/ansi';
import { GLYPH_GROUPS } from '../glyph-groups';

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const graphemeCount = (text: string): number => Array.from(segmenter.segment(text)).length;
// The private use areas, where Nerd Font icons live, and the IEC power
// symbols, which many terminal fonts lack and Nerd Fonts add
const isNerdFontGlyph = (glyph: string): boolean => Array.from(glyph).some((char) => {
    const code = char.codePointAt(0) ?? 0;
    return (code >= 0xE000 && code <= 0xF8FF) || code >= 0xF0000 || (code >= 0x23FB && code <= 0x23FE) || code === 0x2B58;
});

describe('glyph groups', () => {
    it('has named groups with glyphs in them', () => {
        expect(GLYPH_GROUPS.length).toBeGreaterThan(5);
        for (const group of GLYPH_GROUPS) {
            expect(group.name).not.toBe('');
            expect(group.glyphs.length).toBeGreaterThan(0);
        }
    });

    it.each(GLYPH_GROUPS.map(group => [group.name, group] as const))('%s holds single, named, distinct glyphs', (_name, group) => {
        for (const entry of group.glyphs) {
            expect(graphemeCount(entry.glyph), entry.name).toBe(1);
            expect(entry.name).not.toBe('');
        }
        expect(new Set(group.glyphs.map(entry => entry.glyph)).size).toBe(group.glyphs.length);
    });

    // So the picker's grid lines up
    it.each(GLYPH_GROUPS.map(group => [group.name, group] as const))('%s draws every glyph at one width', (_name, group) => {
        const widths = new Set(group.glyphs.map(entry => getVisibleWidth(entry.glyph)));
        expect(widths.size).toBe(1);
        expect([1, 2]).toContain([...widths][0]);
    });

    it.each(GLYPH_GROUPS.map(group => [group.name, group] as const))('%s marks whether it needs a Nerd Font', (_name, group) => {
        for (const entry of group.glyphs) {
            expect(isNerdFontGlyph(entry.glyph), entry.name).toBe(group.needsNerdFont);
        }
    });
});
