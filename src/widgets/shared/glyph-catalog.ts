import { isEmojiByDefault } from '../../utils/ansi';

import {
    GLYPH_GROUPS,
    type GlyphEntry,
    type GlyphGroup
} from './glyph-groups';
import { NERD_FONT_GLYPHS } from './nerd-font-glyphs';
import {
    EMOJI_GLYPHS,
    SYMBOL_GLYPHS
} from './unicode-glyphs';

// Everything the glyph picker offers: the curated groups to browse, and a
// search over them plus every Unicode emoji and symbol and every Nerd Font icon.
// The picker loads this module only when it opens, so the status line never
// loads the data.
export interface GlyphCatalog {
    groups: readonly GlyphGroup[];
    /** Glyphs whose names hold every word of the query: curated ones first, then Unicode's, then Nerd Font's. */
    search: (query: string) => GlyphEntry[];
}

// "git merge queue (nf-oct-git_merge_queue)", with every alias in the brackets
function formatNerdFontName(names: string[]): string {
    const readable = (names[0] ?? '').split('-').slice(1).join('-').replaceAll('_', ' ');
    const aliases = names.map(name => 'nf-' + name).join(', ');
    return `${readable} (${aliases})`;
}

function parseNerdFontGlyphs(): GlyphEntry[] {
    return NERD_FONT_GLYPHS.flatMap(set => set.split(';').map((entry) => {
        const [code = '', ...names] = entry.split(' ');
        return { glyph: String.fromCodePoint(Number.parseInt(code, 16)), name: formatNerdFontName(names) };
    }));
}

// "1F468-200D-1F4BB man technologist;...": an emoji sequence's codepoints are
// joined with "-", and an emoji that takes a skin tone has its light tone
// version after a "/" ("1F44D/1F44D-1F3FB thumbs up")
function parseUnicodeGlyphs(data: string): GlyphEntry[] {
    const toGlyph = (codes: string) => String.fromCodePoint(...codes.split('-').map(code => Number.parseInt(code, 16)));
    return data.split(';').map((entry) => {
        const space = entry.indexOf(' ');
        const [codes = '', lightTone] = entry.slice(0, space).split('/');
        const name = entry.slice(space + 1);
        return lightTone ? { glyph: toGlyph(codes), name, lightTone: toGlyph(lightTone) } : { glyph: toGlyph(codes), name };
    });
}

// The curated emoji that take a skin tone get their light tone versions from
// Unicode's data; a curated emoji may leave out its emoji selector (U+FE0F)
function addSkinTones(groups: readonly GlyphGroup[], emoji: GlyphEntry[]): GlyphGroup[] {
    const withoutSelector = (glyph: string) => glyph.replaceAll('\uFE0F', '');
    const lightTones = new Map(emoji.filter(entry => entry.lightTone).map(entry => [withoutSelector(entry.glyph), entry.lightTone]));
    return groups.map(group => ({
        ...group,
        glyphs: group.glyphs.map((entry) => {
            const lightTone = lightTones.get(withoutSelector(entry.glyph));
            return lightTone ? { ...entry, lightTone } : entry;
        })
    }));
}

// Lowercase, with _ and - as word breaks, so "pull req" finds git_pull_request
function toSearchText(text: string): string {
    return text.toLowerCase().replace(/[_-]/g, ' ');
}

// The emoji selector (U+FE0F) makes ❤ the emoji ❤️, a different glyph, but on
// a character that's an emoji by default (⚡) it changes nothing, so ⚡ and ⚡️
// are one entry
function getSearchKey(glyph: string): string {
    const base = glyph.replaceAll('\uFE0F', '');
    return Array.from(base).length === 1 && isEmojiByDefault(base) ? base : glyph;
}

export function createGlyphCatalog(): GlyphCatalog {
    const emoji = parseUnicodeGlyphs(EMOJI_GLYPHS);
    const groups = addSkinTones(GLYPH_GROUPS, emoji);
    // Search lists each glyph once, under its first name (curated, then the
    // emoji's, the character's, Nerd Font's), but finds it by any of them: ⚡️
    // shows as "high voltage" and "high voltage sign" finds it too. An emoji's
    // text and emoji forms (❤ and ❤️) are different glyphs, so both show.
    const searchable = new Map<string, { entry: GlyphEntry; text: string }>();
    const everything = [
        ...groups.flatMap(group => group.glyphs),
        ...emoji,
        ...parseUnicodeGlyphs(SYMBOL_GLYPHS),
        ...parseNerdFontGlyphs()
    ];
    for (const entry of everything) {
        const key = getSearchKey(entry.glyph);
        const found = searchable.get(key);
        if (found) {
            found.text += ` ${toSearchText(entry.name)}`;
        } else {
            searchable.set(key, { entry, text: toSearchText(entry.name) });
        }
    }
    const entries = [...searchable.values()];

    return {
        groups,
        search: (query) => {
            const terms = toSearchText(query).split(' ').filter(term => term.length > 0);
            if (terms.length === 0) {
                return [];
            }
            return entries.filter(({ text }) => terms.every(term => text.includes(term))).map(({ entry }) => entry);
        }
    };
}
