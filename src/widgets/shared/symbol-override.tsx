import {
    Box,
    Text,
    useInput
} from 'ink';
import React, { useState } from 'react';

import type {
    CustomKeybind,
    WidgetEditorProps,
    WidgetItem
} from '../../types/Widget';
import { getVisibleWidth } from '../../utils/ansi';
import { shouldInsertInput } from '../../utils/input-guards';

import { BlinkingCursor } from './BlinkingCursor';
import { GlyphPicker } from './glyph-picker';
import { removeMetadataKeys } from './metadata';
import { getGraphemes } from './text-cursor';

export const SYMBOL_OVERRIDE_ACTION = 'edit-symbol-override';

const SYMBOL_KEYBIND: CustomKeybind = {
    key: 'g',
    label: '(g)lyph',
    action: SYMBOL_OVERRIDE_ACTION
};

export function getSymbolKeybind(): CustomKeybind {
    return SYMBOL_KEYBIND;
}

// One editable symbol of a widget. id 'character' stores on the item's
// character field (the pre-existing override convention); any other id is a
// metadata key, which is how widgets with several symbols keep them apart.
export interface SymbolSlot {
    id: string;
    label: string;
    defaultSymbol: string;
}

/** The effective symbol for an item: its character override, or the widget default. */
export function getSymbol(item: WidgetItem, defaultSymbol: string): string {
    return item.character ?? defaultSymbol;
}

/** The symbol plus its joining space; an empty override collapses the space too. */
export function formatSymbolPrefix(item: WidgetItem, defaultSymbol: string): string {
    const symbol = getSymbol(item, defaultSymbol);
    return symbol.length > 0 ? `${symbol} ` : '';
}

/** Joins a symbol to text, optionally reserving room for an overhanging glyph. */
export function joinSymbol(symbol: string, text: string, minimumSymbolWidth = 0): string {
    const gap = ' '.repeat(Math.max(0, minimumSymbolWidth - getVisibleWidth(symbol)) + 1);
    return symbol.length > 0 ? `${symbol}${gap}${text}` : text;
}

export function getSlotSymbol(item: WidgetItem, slot: SymbolSlot): string {
    if (slot.id === 'character') {
        return getSymbol(item, slot.defaultSymbol);
    }

    return item.metadata?.[slot.id] ?? slot.defaultSymbol;
}

// Overrides matching the widget default are removed so untouched items stay
// minimal. Exported for tests.
export function setSlotSymbol(item: WidgetItem, slot: SymbolSlot, value: string): WidgetItem {
    if (slot.id === 'character') {
        if (value === slot.defaultSymbol) {
            const { character, ...rest } = item;
            return rest;
        }

        return { ...item, character: value };
    }

    if (value === slot.defaultSymbol) {
        return removeMetadataKeys(item, [slot.id]);
    }

    return {
        ...item,
        metadata: {
            ...item.metadata,
            [slot.id]: value
        }
    };
}

export function renderSymbolOverrideEditor(props: WidgetEditorProps, defaultSymbol: string): React.ReactElement {
    return renderSymbolSlotsEditor(props, [{ id: 'character', label: 'Glyph', defaultSymbol }]);
}

export function renderSymbolSlotsEditor(props: WidgetEditorProps, slots: SymbolSlot[]): React.ReactElement {
    return <SymbolSlotsEditor {...props} slots={slots} />;
}

const SymbolSlotsEditor: React.FC<WidgetEditorProps & { slots: SymbolSlot[] }> = ({ widget, slots, onComplete, onCancel }) => {
    const [values, setValues] = useState<string[]>(() => slots.map(slot => getSlotSymbol(widget, slot)));
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [picking, setPicking] = useState(false);
    const labelWidth = Math.max(...slots.map(slot => getVisibleWidth(slot.label)), 0);

    const setSelectedValue = (value: string) => {
        setValues(values.map((current, index) => (index === selectedIndex ? value : current)));
    };

    // ↑↓ wrap around the rows
    const moveSelection = (step: number) => {
        setSelectedIndex((selectedIndex + step + slots.length) % slots.length);
    };

    // The picker takes the keys while it's open
    useInput((input, key) => {
        if (key.rightArrow) {
            setPicking(true);
        } else if (key.return) {
            onComplete(slots.reduce((item, slot, index) => setSlotSymbol(item, slot, values[index] ?? ''), widget));
        } else if (key.escape) {
            onCancel();
        } else if (key.upArrow && slots.length > 1) {
            moveSelection(-1);
        } else if (key.downArrow && slots.length > 1) {
            moveSelection(1);
        } else if (key.tab && key.shift) {
            // Widgets with several glyphs are mostly blanked whole to save
            // width on the status line, which is one Backspace per row
            // otherwise. Blanked rows toggle back so the key is reversible.
            const allBlank = values.every(value => value.length === 0);
            setValues(values.map((_, index) => (allBlank ? slots[index]?.defaultSymbol ?? '' : '')));
        } else if (key.tab) {
            setSelectedValue(slots[selectedIndex]?.defaultSymbol ?? '');
        } else if (key.backspace || key.delete) {
            setSelectedValue('');
        } else if (shouldInsertInput(input, key)) {
            // Take only the first grapheme (handles multi-byte emojis correctly)
            setSelectedValue(getGraphemes(input)[0] ?? '');
        }
    }, { isActive: !picking });

    if (picking) {
        return (
            <GlyphPicker
                initialGlyph={values[selectedIndex] ?? ''}
                onPick={(glyph) => {
                    setSelectedValue(glyph);
                    setPicking(false);
                }}
                onCancel={() => { setPicking(false); }}
            />
        );
    }

    return (
        <Box flexDirection='column'>
            <Text bold>Glyphs</Text>
            <Text dimColor>
                {slots.length > 1
                    ? '↑↓ row, type to set, → pick from a list, Tab default, Backspace none, Shift+Tab toggle all none/default, Enter save, ESC cancel'
                    : 'Type any character or emoji, → pick from a list, Tab default, Backspace none, Enter save, ESC cancel'}
            </Text>
            <Box marginTop={1} flexDirection='column'>
                {slots.map((slot, index) => {
                    const isSelected = index === selectedIndex;
                    const value = values[index] ?? '';
                    // Nerd Font glyphs can draw into a second cell even when their
                    // terminal width is one. Keep that cell inside the highlight.
                    const displayValue = value
                        ? value + ' '.repeat(Math.max(0, 2 - getVisibleWidth(value)))
                        : '(none)';
                    const labelPadding = ' '.repeat(Math.max(labelWidth - getVisibleWidth(slot.label), 0));
                    return (
                        <Box key={slot.id} flexDirection='row' flexWrap='nowrap'>
                            <Box width={4}>
                                <Text color={isSelected ? 'green' : undefined}>
                                    {isSelected ? '▶ ' : '  '}
                                </Text>
                            </Box>
                            {/* One Text: Ink lays out each part of a multi-part emoji (👍🏾, 👩‍💻) as
                                its own character, so a second Text would overwrite the rest of it */}
                            <Text>
                                <Text color={isSelected ? 'green' : undefined}>
                                    {`${labelPadding}${slot.label}: `}
                                </Text>
                                {isSelected ? (
                                    <BlinkingCursor inverse dimColor={!value}>{displayValue}</BlinkingCursor>
                                ) : (
                                    <Text inverse dimColor={!value}>{displayValue}</Text>
                                )}
                                <Text dimColor>{` (default: ${slot.defaultSymbol})`}</Text>
                            </Text>
                        </Box>
                    );
                })}
            </Box>
        </Box>
    );
};
