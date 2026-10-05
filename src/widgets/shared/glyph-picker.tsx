import {
    Box,
    Text,
    useInput
} from 'ink';
import React, { useState } from 'react';

import { getVisibleWidth } from '../../utils/ansi';

import {
    GLYPH_GROUPS,
    type GlyphGroup
} from './glyph-groups';

const COLUMNS = 10;
// Every glyph takes two cells in the grid, so one-cell glyphs line up too
const CELL_WIDTH = 2;

export interface GlyphPickerProps {
    /** The glyph set now; the picker opens on it when it has it. */
    initialGlyph: string;
    onPick: (glyph: string) => void;
    onCancel: () => void;
}

function findGlyph(glyph: string): { group: number; index: number } {
    for (const [group, entries] of GLYPH_GROUPS.entries()) {
        const index = entries.glyphs.findIndex(entry => entry.glyph === glyph);
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

function chunkRows(group: GlyphGroup): string[][] {
    const rows: string[][] = [];
    for (let start = 0; start < group.glyphs.length; start += COLUMNS) {
        rows.push(group.glyphs.slice(start, start + COLUMNS).map(entry => entry.glyph));
    }
    return rows;
}

// Picks a glyph from groups of them: the arrows move through a group's grid,
// Tab / Shift+Tab or PgDn / PgUp page between groups
export const GlyphPicker: React.FC<GlyphPickerProps> = ({ initialGlyph, onPick, onCancel }) => {
    const [position, setPosition] = useState(() => findGlyph(initialGlyph));
    const group = GLYPH_GROUPS[position.group] ?? GLYPH_GROUPS[0];
    const glyphs = group?.glyphs ?? [];
    const selected = glyphs[position.index];

    const changeGroup = (direction: 1 | -1) => {
        setPosition({ group: (position.group + direction + GLYPH_GROUPS.length) % GLYPH_GROUPS.length, index: 0 });
    };
    const moveTo = (index: number) => {
        if (index >= 0 && index < glyphs.length) {
            setPosition({ ...position, index });
        }
    };

    useInput((_input, key) => {
        if (key.return) {
            if (selected) {
                onPick(selected.glyph);
            }
        } else if (key.escape) {
            onCancel();
        } else if (key.tab) {
            changeGroup(key.shift ? -1 : 1);
        } else if (key.pageDown || key.pageUp) {
            changeGroup(key.pageDown ? 1 : -1);
        } else if (key.leftArrow || key.rightArrow) {
            moveTo(position.index + (key.rightArrow ? 1 : -1));
        } else if (key.upArrow) {
            moveTo(position.index - COLUMNS);
        } else if (key.downArrow) {
            // Down from past the end of a short last row lands on its last glyph
            moveTo(Math.min(position.index + COLUMNS, glyphs.length - 1));
        }
    });

    if (!group) {
        return <Text>No glyphs to pick from</Text>;
    }

    return (
        <Box flexDirection='column'>
            <Text>
                <Text bold>{`Pick a glyph: ${group.name}`}</Text>
                <Text dimColor>{` (${position.group + 1}/${GLYPH_GROUPS.length})`}</Text>
            </Text>
            <Text dimColor>←→↑↓ move, Tab/Shift+Tab or PgDn/PgUp group, Enter pick, ESC back</Text>
            {group.needsNerdFont && <Text dimColor>Needs a Nerd Font; shows boxes without one.</Text>}
            <Box marginTop={1} flexDirection='column'>
                {chunkRows(group).map((row, rowIndex) => (
                    // A row's glyphs are unique within the group
                    <Text key={row.join('')}>
                        {row.map((glyph, column) => formatCell(glyph, rowIndex * COLUMNS + column === position.index)).join('')}
                    </Text>
                ))}
            </Box>
            <Box marginTop={1}>
                <Text color='cyan'>{selected ? `${selected.glyph}  ${selected.name}` : ''}</Text>
            </Box>
        </Box>
    );
};
