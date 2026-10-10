import {
    Box,
    Text,
    useInput,
    type Key
} from 'ink';
import React, { useState } from 'react';

import {
    getColorLevelString,
    type ColorLevelString
} from '../../types/ColorLevel';
import type {
    WidgetEditorProps,
    WidgetItem
} from '../../types/Widget';
import {
    applyColors,
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
// whole: Thinking Effort's level colors, the Model widget's family colors, the
// usage widgets' value colors.

// The colors the status line draws at the configured color level; at No Color
// (colorsDisabled) it draws none
export interface EditorColors {
    colorLevel: ColorLevelString;
    colorsDisabled: boolean;
}

const NAMED_COLORS = getAvailableColorsForUI().map(color => color.value).filter(value => value !== '');

// Custom (hex/ansi256) colors aren't in the named list, so cycling from one
// starts at either end of it
function cycleNamedColor(current: string, direction: 1 | -1): string {
    const index = NAMED_COLORS.indexOf(current);
    let nextIndex = (index + direction + NAMED_COLORS.length) % NAMED_COLORS.length;
    if (index === -1) {
        nextIndex = direction === 1 ? 0 : NAMED_COLORS.length - 1;
    }
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

function paint(text: string, color: string, colors: EditorColors): string {
    return colors.colorsDisabled ? text : paintForeground(text, color, colors.colorLevel);
}

// A color row cycles the named colors with ←→ and takes a custom color with
// (x); a setting row steps through its values with ←→, and some also take a
// typed number.
export type ColorListRow<C extends string, X extends string>
    = | { kind: 'color'; key: C; label: string }
        | { kind: 'setting'; key: X; label: string };

export interface ColorListEditorConfig<C extends string, X extends string = never> {
    title: string;
    /** Names the on/off switch, e.g. "Level colors". */
    toggleLabel: string;
    rows: readonly ColorListRow<C, X>[];
    /** Hides rows that don't apply, e.g. another mode's settings; without it every row shows. */
    isRowShown?: (item: WidgetItem, row: ColorListRow<C, X>) => boolean;
    /** A warning about the draft, e.g. a setting the color level can't show. */
    getNotice?: (item: WidgetItem) => string | null;
    isEnabled: (item: WidgetItem) => boolean;
    setEnabled: (item: WidgetItem, enabled: boolean) => WidgetItem;
    /** The color the status line draws at the given color level. */
    getColor: (item: WidgetItem, key: C, colorLevel: ColorLevelString) => string;
    setColor: (item: WidgetItem, key: C, color: string) => WidgetItem;
    getSettingLabel?: (item: WidgetItem, key: X) => string;
    cycleSetting?: (item: WidgetItem, key: X, direction: 1 | -1) => WidgetItem;
    /** Settings that also take a typed number; a digit starts the input. */
    typedSettings?: {
        keys: readonly X[];
        /** Describes the number in the input's prompt, e.g. "percent". */
        hint: string;
        /** The updated item, or the error to show. */
        set: (item: WidgetItem, key: X, text: string) => WidgetItem | string;
    };
    /** (d)efaults: back to the default colors and settings. */
    resetColors: (item: WidgetItem) => WidgetItem;
    /**
     * The sample shows the highlighted color row, or the last one highlighted:
     * the widget's text with only its own runs colored (Widget.colorsOnlyItsRuns).
     */
    renderSample: (item: WidgetItem, key: C, colors: EditorColors) => string;
    /** Follows the sample, outside the widget's colors, e.g. what its values are of. */
    sampleNote?: string;
    /** The widget's default color, for the rest of the sample while the item has none. */
    defaultColor: string;
    /** A second help line, for keys only this editor has. */
    extraHelp?: string;
}

const CUSTOM_COLOR_ERROR = 'Not a color. Use #RRGGBB, or a number from 0 to 255.';

interface TypedInput {
    text: string;
    error: string | null;
}

export interface ColorListEditorProps<C extends string, X extends string> extends WidgetEditorProps { config: ColorListEditorConfig<C, X> }

export function ColorListEditor<C extends string, X extends string = never>({ widget, onComplete, onCancel, settings, config }: Readonly<ColorListEditorProps<C, X>>): React.ReactElement {
    const firstColorRow = config.rows.find(row => row.kind === 'color');
    const [draft, setDraft] = useState(widget);
    const [selection, setSelection] = useState(0);
    const [sampleKey, setSampleKey] = useState<C | undefined>(firstColorRow?.kind === 'color' ? firstColorRow.key : undefined);
    const [input, setInput] = useState<TypedInput | null>(null);

    const rows = config.rows.filter(row => config.isRowShown?.(draft, row) ?? true);
    // A change can hide rows; the selection stays on one that shows
    const selectedIndex = Math.min(selection, rows.length - 1);
    const selectedRow = rows[selectedIndex];
    const enabled = config.isEnabled(draft);
    const colors: EditorColors = {
        colorLevel: getColorLevelString(settings?.colorLevel),
        colorsDisabled: settings?.colorLevel === 0
    };

    const moveTo = (index: number) => {
        setSelection(index);
        const row = rows[index];
        if (row?.kind === 'color') {
            setSampleKey(row.key);
        }
    };

    const typedSettings = config.typedSettings;
    const takesTypedNumber = selectedRow?.kind === 'setting' && (typedSettings?.keys.includes(selectedRow.key) ?? false);

    // A custom color on a color row, a number on a setting row
    const applyInput = (text: string): string | null => {
        if (selectedRow?.kind === 'color') {
            const color = parseCustomColor(text);
            if (!color) {
                return CUSTOM_COLOR_ERROR;
            }
            setDraft(config.setColor(draft, selectedRow.key, color));
            return null;
        }
        if (selectedRow?.kind === 'setting' && typedSettings) {
            const result = typedSettings.set(draft, selectedRow.key, text);
            if (typeof result === 'string') {
                return result;
            }
            setDraft(result);
        }
        return null;
    };

    // Keys while a custom color or a number is being typed
    const handleTypedInput = (inputChar: string, key: Key, current: TypedInput) => {
        if (key.escape) {
            setInput(null);
        } else if (key.return) {
            const error = applyInput(current.text);
            setInput(error === null ? null : { text: current.text, error });
        } else if (key.backspace || key.delete) {
            setInput({ text: current.text.slice(0, -1), error: null });
        } else if (shouldInsertInput(inputChar, key)) {
            setInput({ text: current.text + inputChar, error: null });
        }
    };

    // ←→: the next named color on a color row, the next value on a setting row
    const changeSelected = (direction: 1 | -1) => {
        if (selectedRow?.kind === 'setting' && config.cycleSetting) {
            setDraft(config.cycleSetting(draft, selectedRow.key, direction));
        } else if (selectedRow?.kind === 'color') {
            const current = config.getColor(draft, selectedRow.key, colors.colorLevel);
            setDraft(config.setColor(draft, selectedRow.key, cycleNamedColor(current, direction)));
        }
    };

    useInput((inputChar, key) => {
        if (input !== null) {
            handleTypedInput(inputChar, key, input);
            return;
        }

        const shortcut = getPlainInput(inputChar, key);

        if (key.return) {
            onComplete(draft);
        } else if (key.escape) {
            onCancel();
        } else if (key.upArrow) {
            moveTo((selectedIndex - 1 + rows.length) % rows.length);
        } else if (key.downArrow) {
            moveTo((selectedIndex + 1) % rows.length);
        } else if (key.leftArrow || key.rightArrow) {
            changeSelected(key.rightArrow ? 1 : -1);
        } else if (shortcut === ' ') {
            setDraft(config.setEnabled(draft, !enabled));
        } else if (shortcut === 'x' && selectedRow?.kind === 'color') {
            setInput({ text: '', error: null });
        } else if (takesTypedNumber && /^\d$/.test(shortcut)) {
            setInput({ text: shortcut, error: null });
        } else if (shortcut === 'd') {
            setDraft(config.resetColors(draft));
        }
    });

    // Colored as the status line colors it: the widget color around the runs
    // the widget colors itself
    const sample = sampleKey === undefined ? '' : applyColors(
        config.renderSample(draft, sampleKey, colors),
        draft.color ?? config.defaultColor,
        undefined,
        false,
        colors.colorLevel,
        undefined,
        true
    );
    const notice = config.getNotice?.(draft) ?? null;

    return (
        <Box flexDirection='column'>
            <Text bold>{config.title}</Text>
            <Text dimColor>↑↓ select, ←→ change color, Space on/off, (x) custom color, (d)efaults, Enter save, ESC cancel</Text>
            {config.extraHelp && <Text dimColor>{config.extraHelp}</Text>}
            <Box marginTop={1}>
                <Text>Sample: </Text>
                <Text>{sample}</Text>
                {config.sampleNote && <Text>{` ${config.sampleNote}`}</Text>}
            </Box>
            <Box marginTop={1}>
                <Text>{`${config.toggleLabel}: `}</Text>
                <Text color={enabled ? 'green' : 'red'}>{enabled ? 'On' : 'Off'}</Text>
                {!enabled && <Text dimColor>  (Space to turn on; the widget uses its single color until then)</Text>}
            </Box>
            {notice && <Text color='yellow'>{`⚠ ${notice}`}</Text>}
            {input !== null && selectedRow && (
                <Box marginTop={1} flexDirection='column'>
                    <Box>
                        <Text>
                            {selectedRow.kind === 'color'
                                ? `Custom color for ${selectedRow.label} (#RRGGBB or 0-255): `
                                : `${selectedRow.label} (${typedSettings?.hint ?? 'number'}): `}
                        </Text>
                        <Text color='cyan'>{input.text}</Text>
                    </Box>
                    {input.error && <Text color='red'>{input.error}</Text>}
                </Box>
            )}
            <Box marginTop={1} flexDirection='column'>
                {rows.map((row, index) => {
                    const isSelected = index === selectedIndex;
                    let value: string;
                    if (row.kind === 'setting') {
                        value = config.getSettingLabel ? config.getSettingLabel(draft, row.key) : '';
                    } else {
                        const color = config.getColor(draft, row.key, colors.colorLevel);
                        value = paint(getColorLabel(color), color, colors);
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
