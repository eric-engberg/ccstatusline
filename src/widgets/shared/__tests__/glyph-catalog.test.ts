import {
    describe,
    expect,
    it
} from 'vitest';

import { createGlyphCatalog } from '../glyph-catalog';
import {
    GLYPH_GROUPS,
    type GlyphGroup
} from '../glyph-groups';

const catalog = createGlyphCatalog();
const glyphsFor = (query: string): string[] => catalog.search(query).map(entry => entry.glyph);
// The matches outside the Nerd Font sets
const unicodeFor = (query: string): string[] => catalog.search(query).filter(entry => !entry.name.includes('(nf-')).map(entry => entry.glyph);

describe('glyph catalog', () => {
    it('browses the curated groups, then every Nerd Font icon set as a group', () => {
        const setGroups = catalog.groups.slice(GLYPH_GROUPS.length);

        // The curated groups, with skin tones added to their emoji
        const withoutTones = (groups: readonly GlyphGroup[]) => groups.map(group => ({ ...group, glyphs: group.glyphs.map(({ glyph, name }) => ({ glyph, name })) }));
        expect(withoutTones(catalog.groups.slice(0, GLYPH_GROUPS.length))).toEqual(withoutTones(GLYPH_GROUPS));
        expect(setGroups.map(group => group.name)).toContain('Nerd Font: Octicons');
        expect(setGroups.every(group => group.needsNerdFont)).toBe(true);
        expect(setGroups.reduce((count, group) => count + group.glyphs.length, 0)).toBeGreaterThan(10000);
        expect(setGroups.find(group => group.name === 'Nerd Font: Material Design')?.glyphs).toHaveLength(6896);
        expect(setGroups.find(group => group.name === 'Nerd Font: Octicons')?.glyphs.map(entry => entry.glyph)).toContain('\uF4C9');
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

    it('finds every Unicode emoji, joined ones and flags included', () => {
        expect(unicodeFor('clown')).toEqual(['🤡']);
        expect(unicodeFor('nauseated')).toEqual(['🤢']);
        expect(unicodeFor('woman technologist')).toEqual(['👩‍💻']);
        expect(unicodeFor('flag japan')).toEqual(['🇯🇵']);
    });

    // Over 2,000 near-copies otherwise
    it('leaves out skin tone variants', () => {
        expect(unicodeFor('waving hand')).toEqual(['👋']);
        expect(unicodeFor('skin tone')).toEqual([]);
    });

    it('finds every character in the Unicode symbol blocks, and a few common ones from elsewhere', () => {
        expect(unicodeFor('place of interest')).toEqual(['⌘']);
        expect(unicodeFor('box drawings light horizontal')[0]).toBe('─');
        expect(unicodeFor('braille pattern dots 123')).toContain('⠇');
        expect(unicodeFor('pilcrow')).toContain('¶');
        expect(unicodeFor('greek small letter pi')).toEqual(['π']);
    });

    // ❗ is the emoji "red exclamation mark" and the Dingbats character "heavy exclamation mark symbol"
    it('lists a glyph once under its first name and finds it by any of them', () => {
        expect(catalog.search('heavy exclamation mark symbol').map(entry => [entry.glyph, entry.name])).toEqual([['❗', 'red exclamation mark']]);
        expect(unicodeFor('exclamation mark').filter(glyph => glyph === '❗')).toHaveLength(1);
    });

    it('keeps an emoji\'s text and emoji forms apart', () => {
        expect(unicodeFor('red heart')).toEqual(['❤️']);
        expect(unicodeFor('heavy black heart')[0]).toBe('❤');
        expect(unicodeFor('heavy black heart')).not.toContain('❤️');
    });

    // The light tone version is what the picker turns into the chosen tone
    it('knows which emoji take a skin tone, and where the tone goes', () => {
        const lightTone = (query: string, glyph: string) => catalog.search(query).find(entry => entry.glyph === glyph)?.lightTone;

        expect(lightTone('thumbs up', '👍')).toBe('👍🏻');
        expect(lightTone('woman technologist', '👩‍💻')).toBe('👩🏻‍💻');
        // The emoji selector goes when a tone comes in
        expect(lightTone('hand with fingers splayed', '🖐️')).toBe('🖐🏻');
        // Both people
        expect(lightTone('people holding hands', '🧑‍🤝‍🧑')).toBe('🧑🏻‍🤝‍🧑🏻');
        expect(lightTone('clown', '🤡')).toBeUndefined();
    });

    it('gives the curated groups\' emoji their skin tones too', () => {
        const curated = catalog.groups.slice(0, GLYPH_GROUPS.length).flatMap(group => group.glyphs);

        expect(curated.find(entry => entry.glyph === '👍')?.lightTone).toBe('👍🏻');
        expect(curated.filter(entry => entry.lightTone).length).toBeGreaterThan(5);
    });

    it('finds hundreds of emoji that take a skin tone', () => {
        const toned = new Set(catalog.search('a').concat(catalog.search('e')).filter(entry => entry.lightTone).map(entry => entry.glyph));

        expect(toned.size).toBeGreaterThan(300);
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
