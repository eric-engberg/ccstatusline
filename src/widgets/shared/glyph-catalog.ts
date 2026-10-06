import {
    GLYPH_GROUPS,
    type GlyphEntry,
    type GlyphGroup
} from './glyph-groups';
import { NERD_FONT_SETS } from './nerd-font-glyphs';
import {
    EMOJI_GLYPHS,
    SYMBOL_GLYPHS
} from './unicode-glyphs';

// Everything the glyph picker offers: the curated groups, then every Nerd Font
// icon set as a group, and a search over all of them plus every Unicode emoji
// and symbol. The picker loads this module only when it opens, so the status
// line never loads the data.
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

// The icon sets' names, by the prefix of their glyphs' names
const SET_NAMES: Record<string, string> = {
    cod: 'Codicons',
    custom: 'Custom',
    dev: 'Devicons',
    extra: 'Extra',
    fa: 'Font Awesome',
    fae: 'Font Awesome Extension',
    iec: 'IEC Power Symbols',
    indent: 'Indentation',
    linux: 'Font Logos',
    md: 'Material Design',
    oct: 'Octicons',
    pl: 'Powerline',
    ple: 'Powerline Extra',
    pom: 'Pomicons',
    seti: 'Seti UI',
    weather: 'Weather Icons'
};

function parseNerdFontSets(): GlyphGroup[] {
    return NERD_FONT_SETS.map(set => ({
        name: `Nerd Font: ${SET_NAMES[set.id] ?? set.id}`,
        needsNerdFont: true,
        glyphs: set.glyphs.split(';').map((entry) => {
            const [code = '', ...names] = entry.split(' ');
            return { glyph: String.fromCodePoint(Number.parseInt(code, 16)), name: formatNerdFontName(names) };
        })
    }));
}

// "1F468-200D-1F4BB man technologist;...": an emoji sequence's codepoints are
// joined with "-"
function parseUnicodeGlyphs(data: string): GlyphEntry[] {
    return data.split(';').map((entry) => {
        const space = entry.indexOf(' ');
        const codes = entry.slice(0, space).split('-').map(code => Number.parseInt(code, 16));
        return { glyph: String.fromCodePoint(...codes), name: entry.slice(space + 1) };
    });
}

// Lowercase, with _ and - as word breaks, so "pull req" finds git_pull_request
function toSearchText(text: string): string {
    return text.toLowerCase().replace(/[_-]/g, ' ');
}

export function createGlyphCatalog(): GlyphCatalog {
    const nerdFontGroups = parseNerdFontSets();
    const groups = [...GLYPH_GROUPS, ...nerdFontGroups];
    // Search lists each glyph once, under its first name (curated, then the
    // emoji's, the character's, Nerd Font's), but finds it by any of them: ⚡
    // shows as "high voltage" and "high voltage sign" finds it too. An emoji's
    // text and emoji forms (❤ and ❤️) are different glyphs, so both show.
    const searchable = new Map<string, { entry: GlyphEntry; text: string }>();
    const everything = [
        ...GLYPH_GROUPS.flatMap(group => group.glyphs),
        ...parseUnicodeGlyphs(EMOJI_GLYPHS),
        ...parseUnicodeGlyphs(SYMBOL_GLYPHS),
        ...nerdFontGroups.flatMap(group => group.glyphs)
    ];
    for (const entry of everything) {
        const found = searchable.get(entry.glyph);
        if (found) {
            found.text += ` ${toSearchText(entry.name)}`;
        } else {
            searchable.set(entry.glyph, { entry, text: toSearchText(entry.name) });
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
