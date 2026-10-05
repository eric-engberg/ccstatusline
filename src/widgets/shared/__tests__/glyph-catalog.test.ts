import {
    describe,
    expect,
    it
} from 'vitest';

import { createGlyphCatalog } from '../glyph-catalog';
import { GLYPH_GROUPS } from '../glyph-groups';

const catalog = createGlyphCatalog();
const glyphsFor = (query: string): string[] => catalog.search(query).map(entry => entry.glyph);

describe('glyph catalog', () => {
    it('browses the curated groups', () => {
        expect(catalog.groups).toBe(GLYPH_GROUPS);
    });

    it('finds Nerd Font glyphs the groups leave out, by any words of their name', () => {
        expect(glyphsFor('pull request create')).toContain('');
        expect(glyphsFor('pull req draft')).toContain('');
        expect(glyphsFor('feed merged')).toContain('');
        expect(catalog.search('git_merge_queue')[0]?.name).toBe('git merge queue (nf-oct-git_merge_queue)');
    });

    // custom-bazel and seti-bazel are one glyph (dev-bazel is another)
    it('lists a glyph once, with every name it goes by', () => {
        const bazel = catalog.search('seti bazel');

        expect(bazel).toHaveLength(1);
        expect(bazel[0]?.name).toBe('bazel (nf-custom-bazel, nf-seti-bazel)');
        expect(new Set(glyphsFor('folder')).size).toBe(glyphsFor('folder').length);
    });

    it('finds the curated emoji and symbols by their Unicode names', () => {
        expect(glyphsFor('file folder')[0]).toBe('📁');
        expect(glyphsFor('alternative key')).toContain('⎇');
    });

    // A handful (oct-heart, the IEC power symbols) are ordinary Unicode
    it('has every Nerd Font glyph as one character', () => {
        // "nf" also matches the odd emoji name, e.g. "confetti ball"
        const all = catalog.search('nf').filter(entry => entry.name.includes('(nf-'));

        expect(all.length).toBeGreaterThan(10000);
        for (const entry of all) {
            expect(Array.from(entry.glyph), entry.name).toHaveLength(1);
        }
    });

    it('finds nothing for an empty search', () => {
        expect(catalog.search('')).toEqual([]);
        expect(catalog.search('   ')).toEqual([]);
    });
});
