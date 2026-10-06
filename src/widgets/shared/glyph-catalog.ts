import {
    GLYPH_GROUPS,
    type GlyphEntry,
    type GlyphGroup
} from './glyph-groups';
import { NERD_FONT_SETS } from './nerd-font-glyphs';

// Everything the glyph picker offers: the curated groups, then every Nerd Font
// icon set as a group, and a search over all of them. The picker loads this
// module only when it opens, so the status line never loads the data.
export interface GlyphCatalog {
    groups: readonly GlyphGroup[];
    /** Glyphs whose names hold every word of the query, curated ones first. */
    search: (query: string) => GlyphEntry[];
}

// "git merge queue (nf-oct-git_merge_queue)", with every alias in the brackets
function formatNerdFontName(names: string[]): string {
    const readable = (names[0] ?? '').split('-').slice(1).join('-').replace(/_/g, ' ');
    return `${readable} (${names.map(name => `nf-${name}`).join(', ')})`;
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

// Lowercase, with _ and - as word breaks, so "pull req" finds git_pull_request
function toSearchText(text: string): string {
    return text.toLowerCase().replace(/[_-]/g, ' ');
}

export function createGlyphCatalog(): GlyphCatalog {
    const groups = [...GLYPH_GROUPS, ...parseNerdFontSets()];
    // Search lists each glyph once: the curated entry wins over the same Nerd
    // Font glyph
    const unique = new Map<string, GlyphEntry>();
    for (const entry of groups.flatMap(group => group.glyphs)) {
        if (!unique.has(entry.glyph)) {
            unique.set(entry.glyph, entry);
        }
    }
    const searchable = [...unique.values()].map(entry => ({ entry, text: toSearchText(entry.name) }));

    return {
        groups,
        search: (query) => {
            const terms = toSearchText(query).split(' ').filter(term => term.length > 0);
            if (terms.length === 0) {
                return [];
            }
            return searchable.filter(({ text }) => terms.every(term => text.includes(term))).map(({ entry }) => entry);
        }
    };
}
