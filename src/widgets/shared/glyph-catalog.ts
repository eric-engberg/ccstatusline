import {
    GLYPH_GROUPS,
    type GlyphEntry,
    type GlyphGroup
} from './glyph-groups';
import { NERD_FONT_GLYPHS } from './nerd-font-glyphs';

// Everything the glyph picker offers: the curated groups to browse, and a
// search over them plus every Nerd Font glyph they leave out. The picker loads
// this module only when it opens, so the status line never loads the data.
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

function parseNerdFontGlyphs(): GlyphEntry[] {
    return NERD_FONT_GLYPHS.flatMap(set => set.split(';').map((entry) => {
        const [code = '', ...names] = entry.split(' ');
        return { glyph: String.fromCodePoint(Number.parseInt(code, 16)), name: formatNerdFontName(names) };
    }));
}

// Lowercase, with _ and - as word breaks, so "pull req" finds git_pull_request
function toSearchText(text: string): string {
    return text.toLowerCase().replace(/[_-]/g, ' ');
}

export function createGlyphCatalog(): GlyphCatalog {
    // Each glyph once: the curated entry wins over the same Nerd Font glyph
    const unique = new Map<string, GlyphEntry>();
    for (const entry of [...GLYPH_GROUPS.flatMap(group => group.glyphs), ...parseNerdFontGlyphs()]) {
        if (!unique.has(entry.glyph)) {
            unique.set(entry.glyph, entry);
        }
    }
    const searchable = [...unique.values()].map(entry => ({ entry, text: toSearchText(entry.name) }));

    return {
        groups: GLYPH_GROUPS,
        search: (query) => {
            const terms = toSearchText(query).split(' ').filter(term => term.length > 0);
            if (terms.length === 0) {
                return [];
            }
            return searchable.filter(({ text }) => terms.every(term => text.includes(term))).map(({ entry }) => entry);
        }
    };
}
