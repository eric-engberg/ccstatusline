import {
    Box,
    Text,
    useInput
} from 'ink';
import React, { useState } from 'react';

import type {
    WidgetEditorProps,
    WidgetItem
} from '../../types/Widget';
import {
    getAvailableColorsForUI,
    getColorDisplayName
} from '../../utils/colors';
import {
    getPlainInput,
    shouldInsertInput
} from '../../utils/input-guards';

import { parseCustomColor } from './custom-color';
import { paintForeground } from './foreground';

// An editor for a list of per-item colors that can be turned on and off as a
// whole: Thinking Effort's level colors, the Model widget's family colors.

// The editor has no access to the configured color level, so it previews at
// the default (256 colors)
export const EDITOR_COLOR_LEVEL = 'ansi256';

const NAMED_COLORS = getAvailableColorsForUI().map(color => color.value).filter(value => value !== '');

// Custom (hex/ansi256) colors aren't in the named list, so cycling from one
// starts at either end of it
function cycleNamedColor(current: string, direction: 1 | -1): string {
    const index = NAMED_COLORS.indexOf(current);
    const nextIndex = index === -1
        ? (direction === 1 ? 0 : NAMED_COLORS.length - 1)
        : (index + direction + NAMED_COLORS.length) % NAMED_COLORS.length;
    return NAMED_COLORS[nextIndex] ?? current;
}

// Custom colors are labeled the way Edit Colors labels them (ANSI n, #RRGGBB),
// except the default xhigh effort orange, which has no name among the 16
// named colors
function getColorLabel(color: string): string {
    if (color === 'ansi256:208') {
        return 'Orange';
    }
    if (color.startsWith('ansi256:')) {
        return `ANSI ${color.substring(8)}`;
    }
    if (color.startsWith('hex:')) {
        return `#${color.substring(4).toUpperCase()}`;
    }
    return getColorDisplayName(color);
}

// A color row cycles the named colors with ←→ and takes a custom color with
// (x); a choice row flips between two settings with ←→.
export type ColorListRow<C extends string, X extends string>
    = | { kind: 'color'; key: C; label: string }
        | { kind: 'choice'; key: X; label: string };

export interface ColorListEditorConfig<C extends string, X extends string = never> {
    title: string;
    /** Names the on/off switch, e.g. "Level colors". */
    toggleLabel: string;
    rows: readonly ColorListRow<C, X>[];
    isEnabled: (item: WidgetItem) => boolean;
    setEnabled: (item: WidgetItem, enabled: boolean) => WidgetItem;
    getColor: (item: WidgetItem, key: C) => string;
    setColor: (item: WidgetItem, key: C, color: string) => WidgetItem;
    getChoiceLabel?: (item: WidgetItem, key: X) => string;
    cycleChoice?: (item: WidgetItem, key: X) => WidgetItem;
    /** (d)efaults: back to the default colors and choices. */
    resetColors: (item: WidgetItem) => WidgetItem;
    /** The sample shows the highlighted color row, or the last one highlighted. */
    renderSample: (item: WidgetItem, key: C) => string;
}

export interface ColorListEditorProps<C extends string, X extends string> extends WidgetEditorProps { config: ColorListEditorConfig<C, X> }

export function ColorListEditor<C extends string, X extends string = never>({ widget, onComplete, onCancel, config }: ColorListEditorProps<C, X>): React.ReactElement {
    const { rows } = config;
    const firstColorRow = rows.find(row => row.kind === 'color');
    const [draft, setDraft] = useState(widget);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [sampleKey, setSampleKey] = useState<C | undefined>(firstColorRow?.kind === 'color' ? firstColorRow.key : undefined);
    const [customInput, setCustomInput] = useState<string | null>(null);
    const [customError, setCustomError] = useState(false);

    const selectedRow = rows[selectedIndex];
    const enabled = config.isEnabled(draft);

    const moveTo = (index: number) => {
        setSelectedIndex(index);
        const row = rows[index];
        if (row?.kind === 'color') {
            setSampleKey(row.key);
        }
    };

    useInput((input, key) => {
        if (customInput !== null) {
            if (key.escape) {
                setCustomInput(null);
                setCustomError(false);
            } else if (key.return) {
                const color = parseCustomColor(customInput);
                if (color && selectedRow?.kind === 'color') {
                    setDraft(config.setColor(draft, selectedRow.key, color));
                    setCustomInput(null);
                    setCustomError(false);
                } else {
                    setCustomError(true);
                }
            } else if (key.backspace || key.delete) {
                setCustomInput(customInput.slice(0, -1));
            } else if (shouldInsertInput(input, key)) {
                setCustomInput(customInput + input);
                setCustomError(false);
            }
            return;
        }

        const shortcut = getPlainInput(input, key);

        if (key.return) {
            onComplete(draft);
        } else if (key.escape) {
            onCancel();
        } else if (key.upArrow) {
            moveTo(selectedIndex - 1 < 0 ? rows.length - 1 : selectedIndex - 1);
        } else if (key.downArrow) {
            moveTo(selectedIndex + 1 > rows.length - 1 ? 0 : selectedIndex + 1);
        } else if (key.leftArrow || key.rightArrow) {
            if (selectedRow?.kind === 'choice') {
                if (config.cycleChoice) {
                    setDraft(config.cycleChoice(draft, selectedRow.key));
                }
            } else if (selectedRow?.kind === 'color') {
                const current = config.getColor(draft, selectedRow.key);
                setDraft(config.setColor(draft, selectedRow.key, cycleNamedColor(current, key.rightArrow ? 1 : -1)));
            }
        } else if (shortcut === ' ') {
            setDraft(config.setEnabled(draft, !enabled));
        } else if (shortcut === 'x' && selectedRow?.kind === 'color') {
            setCustomInput('');
            setCustomError(false);
        } else if (shortcut === 'd') {
            setDraft(config.resetColors(draft));
        }
    });

    const sample = sampleKey === undefined ? '' : config.renderSample(draft, sampleKey);

    return (
        <Box flexDirection='column'>
            <Text bold>{config.title}</Text>
            <Text dimColor>↑↓ select, ←→ change color, Space on/off, (x) custom color, (d)efaults, Enter save, ESC cancel</Text>
            <Box marginTop={1}>
                <Text>Sample: </Text>
                <Text>{sample}</Text>
            </Box>
            <Box marginTop={1}>
                <Text>{`${config.toggleLabel}: `}</Text>
                <Text color={enabled ? 'green' : 'red'}>{enabled ? 'On' : 'Off'}</Text>
                {!enabled && <Text dimColor>  (Space to turn on; the widget uses its single color until then)</Text>}
            </Box>
            {customInput !== null && selectedRow && (
                <Box marginTop={1} flexDirection='column'>
                    <Box>
                        <Text>{`Custom color for ${selectedRow.label} (#RRGGBB or 0-255): `}</Text>
                        <Text color='cyan'>{customInput}</Text>
                    </Box>
                    {customError && <Text color='red'>Not a color. Use #RRGGBB, or a number from 0 to 255.</Text>}
                </Box>
            )}
            <Box marginTop={1} flexDirection='column'>
                {rows.map((row, index) => {
                    const isSelected = index === selectedIndex;
                    let value: string;
                    if (row.kind === 'choice') {
                        value = config.getChoiceLabel ? config.getChoiceLabel(draft, row.key) : '';
                    } else {
                        const color = config.getColor(draft, row.key);
                        value = paintForeground(getColorLabel(color), color, EDITOR_COLOR_LEVEL);
                    }
                    return (
                        <Box key={row.key} flexDirection='row' flexWrap='nowrap'>
                            <Box width={3}>
                                <Text color={isSelected ? 'green' : undefined}>{isSelected ? '▶ ' : '  '}</Text>
                            </Box>
                            <Box width={11}>
                                <Text color={isSelected ? 'green' : undefined} dimColor={!enabled && !isSelected}>{row.label}</Text>
                            </Box>
                            <Text dimColor={!enabled}>{value}</Text>
                        </Box>
                    );
                })}
            </Box>
        </Box>
    );
}
