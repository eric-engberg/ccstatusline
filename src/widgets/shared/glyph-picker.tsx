import {
    Box,
    Text,
    useInput,
    type Key
} from 'ink';
import React, {
    useContext,
    useEffect,
    useMemo,
    useState
} from 'react';

import type { SkinTone } from '../../types/SkinTone';
import { getVisibleWidth } from '../../utils/ansi';
import { shouldInsertInput } from '../../utils/input-guards';

import type { GlyphCatalog } from './glyph-catalog';
import type { GlyphEntry } from './glyph-groups';
import {
    SkinToneContext,
    applySkinTone,
    cycleSkinTone,
    formatSkinToneName,
    getSkinToneModifier,
    stripSkinTone
} from './skin-tone';

const COLUMNS = 10;
const VISIBLE_ROWS = 6;
const PAGE = COLUMNS * VISIBLE_ROWS;
// Every glyph takes two cells in the grid, so one-cell glyphs line up too
const CELL_WIDTH = 2;

export interface GlyphPickerProps {
    /** The glyph set now; the picker opens on it when it has it. */
    initialGlyph: string;
    onPick: (glyph: string) => void;
    onCancel: () => void;
}

// The glyph data (several hundred KB with every Nerd Font icon) loads the
// first time a picker opens, from its own build chunk, so the status line's
// render path never loads it
let catalogPromise: Promise<GlyphCatalog> | null = null;
function loadGlyphCatalog(): Promise<GlyphCatalog> {
    catalogPromise ??= import('./glyph-catalog').then(module => module.createGlyphCatalog());
    return catalogPromise;
}

// A toned glyph (👍🏾) is found by the emoji it's made from
function findGlyph(catalog: GlyphCatalog, glyph: string): { group: number; index: number } {
    const untoned = stripSkinTone(glyph);
    const matches = (entry: GlyphEntry) => entry.glyph === glyph || (entry.lightTone !== undefined && stripSkinTone(entry.lightTone) === untoned);
    for (const [group, entries] of catalog.groups.entries()) {
        const index = entries.glyphs.findIndex(matches);
        if (index !== -1) {
            return { group, index };
        }
    }
    return { group: 0, index: 0 };
}

function formatCell(glyph: string, selected: boolean): string {
    const padded = glyph + ' '.repeat(Math.max(0, CELL_WIDTH - getVisibleWidth(glyph)));
    return selected ? `[${padded}]` : ` ${padded} `;
}

// The glyph as it shows and picks: an emoji that takes a skin tone, in the chosen one
function getShownGlyph(entry: GlyphEntry, tone: SkinTone | undefined): string {
    return tone && entry.lightTone ? applySkinTone(entry.lightTone, tone) : entry.glyph;
}

function getShownName(entry: GlyphEntry, tone: SkinTone | undefined): string {
    return tone && entry.lightTone ? formatSkinToneName(entry.name, tone) : entry.name;
}

function chunkRows(glyphs: GlyphEntry[], tone: SkinTone | undefined): string[][] {
    const rows: string[][] = [];
    for (let start = 0; start < glyphs.length; start += COLUMNS) {
        rows.push(glyphs.slice(start, start + COLUMNS).map(entry => getShownGlyph(entry, tone)));
    }
    return rows;
}

// The rows on screen: a window that keeps the highlighted row in view
function getVisibleRowRange(rowCount: number, selectedRow: number): { start: number; end: number } {
    const start = Math.max(0, Math.min(selectedRow - Math.floor(VISIBLE_ROWS / 2), rowCount - VISIBLE_ROWS));
    return { start, end: Math.min(rowCount, start + VISIBLE_ROWS) };
}

const GlyphGrid: React.FC<GlyphPickerProps & { catalog: GlyphCatalog }> = ({ catalog, initialGlyph, onPick, onCancel }) => {
    const [position, setPosition] = useState(() => findGlyph(catalog, initialGlyph));
    const [query, setQuery] = useState('');
    // The settings' tone; the picker keeps its own copy so Ctrl+T works without a provider
    const skinToneSetting = useContext(SkinToneContext);
    const [tone, setTone] = useState(skinToneSetting.tone);
    const results = useMemo(() => catalog.search(query), [catalog, query]);
    const searching = query.length > 0;
    const group = catalog.groups[position.group] ?? catalog.groups[0];
    const glyphs = searching ? results : group?.glyphs ?? [];
    const selected = glyphs[position.index];

    const changeGroup = (direction: 1 | -1) => {
        setPosition({ group: (position.group + direction + catalog.groups.length) % catalog.groups.length, index: 0 });
    };
    const moveTo = (index: number) => {
        if (index >= 0 && index < glyphs.length) {
            setPosition({ ...position, index });
        }
    };
    const search = (nextQuery: string) => {
        setQuery(nextQuery);
        setPosition({ ...position, index: 0 });
    };

    // Ctrl+T: the next skin tone, saved to the settings
    const changeSkinTone = () => {
        const next = cycleSkinTone(tone);
        setTone(next);
        skinToneSetting.setTone(next);
    };

    // Keys that only browse the groups or only refine a search
    const handleModeKey = (input: string, key: Key) => {
        if (searching && (key.backspace || key.delete)) {
            search(query.slice(0, -1));
        } else if (!searching && key.tab) {
            changeGroup(key.shift ? -1 : 1);
        } else if (shouldInsertInput(input, key)) {
            search(query + input);
        }
    };

    // Arrows and paging: where the key moves the highlight, or null for other keys
    const getMoveTarget = (key: Key): number | null => {
        if (key.leftArrow || key.rightArrow) {
            return position.index + (key.rightArrow ? 1 : -1);
        }
        if (key.upArrow) {
            return position.index - COLUMNS;
        }
        if (key.downArrow) {
            // Down from past the end of a short last row lands on its last glyph
            return Math.min(position.index + COLUMNS, glyphs.length - 1);
        }
        if (key.pageDown || key.pageUp) {
            return key.pageDown ? Math.min(position.index + PAGE, glyphs.length - 1) : Math.max(position.index - PAGE, 0);
        }
        return null;
    };

    useInput((input, key) => {
        const target = getMoveTarget(key);
        if (key.return) {
            if (selected) {
                onPick(getShownGlyph(selected, tone));
            }
        } else if (key.escape) {
            if (searching) {
                search('');
            } else {
                onCancel();
            }
        } else if (key.ctrl && input === 't') {
            changeSkinTone();
        } else if (target === null) {
            handleModeKey(input, key);
        } else {
            moveTo(target);
        }
    });

    const rows = chunkRows(glyphs, tone);
    const selectedRow = Math.floor(position.index / COLUMNS);
    const { start, end } = getVisibleRowRange(rows.length, selectedRow);
    const matchCount = `${results.length} ${results.length === 1 ? 'match' : 'matches'}`;
    const toneLabel = tone ? [getSkinToneModifier(tone), tone].join(' ') : 'default';

    return (
        <Box flexDirection='column'>
            <Text>
                <Text bold>{searching ? `Pick a glyph: "${query}"` : `Pick a glyph: ${group?.name ?? ''}`}</Text>
                <Text dimColor>{searching ? ` (${matchCount})` : ` (${position.group + 1}/${catalog.groups.length})`}</Text>
                <Text dimColor>{`   Skin tone: ${toneLabel} (Ctrl+T)`}</Text>
            </Text>
            <Text dimColor>
                {searching
                    ? '←→↑↓ move, PgUp/PgDn page, type to refine, Backspace edit, Enter pick, ESC clear search'
                    : '←→↑↓ move, PgUp/PgDn page, Tab/Shift+Tab group, type to search by name, Enter pick, ESC back'}
            </Text>
            {(searching ? selected?.name.includes('(nf-') : group?.needsNerdFont) && (
                <Text dimColor>Needs a Nerd Font; shows boxes without one.</Text>
            )}
            <Box marginTop={1} flexDirection='column'>
                {start > 0 && <Text dimColor>  ↑ more</Text>}
                {rows.slice(start, end).map((row, offset) => (
                    // A row's glyphs are unique within the list
                    <Text key={row.join('')}>
                        {row.map((glyph, column) => formatCell(glyph, (start + offset) * COLUMNS + column === position.index)).join('')}
                    </Text>
                ))}
                {end < rows.length && <Text dimColor>  ↓ more</Text>}
                {glyphs.length === 0 && <Text dimColor>No glyph names match.</Text>}
            </Box>
            <Box marginTop={1}>
                <Text color='cyan'>{selected ? `${getShownGlyph(selected, tone)}  ${getShownName(selected, tone)}` : ''}</Text>
            </Box>
        </Box>
    );
};

// Picks a glyph from groups of them, or by searching every glyph's name
export const GlyphPicker: React.FC<GlyphPickerProps> = (props) => {
    const [catalog, setCatalog] = useState<GlyphCatalog | null>(null);
    const { onCancel } = props;

    useEffect(() => {
        let active = true;
        void loadGlyphCatalog().then((loaded) => {
            if (active) {
                setCatalog(loaded);
            }
        });
        return () => {
            active = false;
        };
    }, []);

    useInput((_input, key) => {
        if (key.escape) {
            onCancel();
        }
    }, { isActive: catalog === null });

    return catalog
        ? <GlyphGrid {...props} catalog={catalog} />
        : <Text dimColor>Loading glyphs…</Text>;
};
