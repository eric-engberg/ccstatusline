import type {
    CustomKeybind,
    WidgetItem
} from '../../types/Widget';

import {
    getBarSize,
    getBarSizeMetadata,
    getBarSizeModifier,
    getImpliedBarSize,
    getStoredBarSize,
    type BarSize
} from './bar-width';
import { removeMetadataKeys } from './metadata';

// A widget's bar has a style (block "[███░░]", slider "▓▓▓░░" or cells "▮▮▮▮▮"),
// a size (see bar-width.ts) and the numbers after it, some or all of which can
// be turned off. They are stored in the display modes saved configs already
// use: block bars as 'progress' (long) or 'progress-short', sliders as 'slider',
// with barWidth only for a size the display mode doesn't already mean. The
// older 'slider-only' mode reads as a slider with its numbers off. Cell bars
// are 'cells', with barCell naming any shape but the first; builds without
// them show the widget's text instead.
export type BarStyle = 'block' | 'slider' | 'cells';

// A cell bar draws its filled and empty cells with the same character, the
// empty ones faint
const BAR_CELL_SHAPES = ['rectangle', 'square', 'seven-eighths', 'parallelogram'] as const;
export type BarCellShape = typeof BAR_CELL_SHAPES[number];
const BAR_CELL_GLYPHS: Record<BarCellShape, string> = {
    'rectangle': '▮',
    'square': '■',
    'seven-eighths': '▉',
    'parallelogram': '▰'
};
const BAR_CELL_KEY = 'barCell';

// Which numbers follow the bar: a percent, and on the Context Bar token counts
export type BarNumbers = 'all' | 'percent' | 'counts' | 'none';
const BAR_NUMBERS: readonly BarNumbers[] = ['all', 'percent', 'counts', 'none'];

const BAR_NUMBERS_KEY = 'barNumbers';
// The setting's first name, saved by early builds of the fork: 'true' for none
const BAR_ONLY_KEY = 'barOnly';
const BAR_NUMBERS_MODIFIERS: Record<BarNumbers, string | null> = {
    all: null,
    percent: '% only',
    counts: 'counts only',
    none: 'numbers off'
};

export const TOGGLE_BAR_NUMBERS_ACTION = 'toggle-bar-numbers';
export const CYCLE_BAR_NUMBERS_ACTION = 'cycle-bar-numbers';

/** The bar's style, or null when the widget shows text instead. */
export function getBarStyle(item: WidgetItem): BarStyle | null {
    const display = item.metadata?.display;
    if (display === 'progress' || display === 'progress-short') {
        return 'block';
    }
    if (display === 'cells') {
        return 'cells';
    }
    return display === 'slider' || display === 'slider-only' ? 'slider' : null;
}

// The first shape unless another one is stored; a shape this build doesn't
// know, say from a later one, draws as the first
export function getBarCellShape(item: WidgetItem): BarCellShape {
    const value = item.metadata?.[BAR_CELL_KEY];
    return BAR_CELL_SHAPES.find(shape => shape === value) ?? 'rectangle';
}

export function getBarCellGlyph(item: WidgetItem): string {
    return BAR_CELL_GLYPHS[getBarCellShape(item)];
}

export function getBarNumbers(item: WidgetItem): BarNumbers {
    const value = item.metadata?.[BAR_NUMBERS_KEY];
    if (value === 'percent' || value === 'counts' || value === 'none') {
        return value;
    }
    return item.metadata?.[BAR_ONLY_KEY] === 'true' || item.metadata?.display === 'slider-only' ? 'none' : 'all';
}

export function showsBarPercent(item: WidgetItem): boolean {
    const numbers = getBarNumbers(item);
    return numbers === 'all' || numbers === 'percent';
}

export function showsBarCounts(item: WidgetItem): boolean {
    const numbers = getBarNumbers(item);
    return numbers === 'all' || numbers === 'counts';
}

// The stored form: nothing for all the numbers
function getBarNumbersMetadata(numbers: BarNumbers): Record<string, string> {
    return numbers === 'all' ? {} : { [BAR_NUMBERS_KEY]: numbers };
}

// Long block bars are 'progress'. A size relative to the line keeps the block
// display mode the bar had, which sets its size on a line of unknown width.
function getBlockDisplay(item: WidgetItem, size: BarSize): string {
    if (size === 'long') {
        return 'progress';
    }
    if (typeof size === 'string' && size !== 'fill') {
        return 'progress-short';
    }
    return item.metadata?.display === 'progress' ? 'progress' : 'progress-short';
}

// The stored form of a cell shape: nothing for the first, or for another style
function getBarCellMetadata(style: BarStyle, shape: BarCellShape): Record<string, string> {
    return style === 'cells' && shape !== BAR_CELL_SHAPES[0] ? { [BAR_CELL_KEY]: shape } : {};
}

function writeBarLayout(item: WidgetItem, style: BarStyle, size: BarSize, numbers: BarNumbers, shape = getBarCellShape(item)): WidgetItem {
    const display = style === 'block' ? getBlockDisplay(item, size) : style;
    const barWidth = getBarSizeMetadata(size, getImpliedBarSize({ ...item, metadata: { display } }));
    const cleared = removeMetadataKeys(item, ['barWidth', BAR_NUMBERS_KEY, BAR_ONLY_KEY, BAR_CELL_KEY]);
    return {
        ...cleared,
        metadata: {
            ...cleared.metadata,
            display,
            ...(barWidth === null ? {} : { barWidth }),
            ...getBarNumbersMetadata(numbers),
            ...getBarCellMetadata(style, shape)
        }
    };
}

// The bar keeps its size; from the text mode it takes the size it had last,
// or the one given. A cell bar starts with the first shape.
export function setBarStyle(item: WidgetItem, style: BarStyle, sizeFromText: BarSize = 'medium'): WidgetItem {
    const size = getBarStyle(item) === null ? (getStoredBarSize(item) ?? sizeFromText) : getBarSize(item);
    return writeBarLayout(item, style, size, getBarNumbers(item), BAR_CELL_SHAPES[0]);
}

function setBarCellShape(item: WidgetItem, shape: BarCellShape): WidgetItem {
    return writeBarLayout(item, 'cells', getBarSize(item), getBarNumbers(item), shape);
}

// (p)'s next bar style, keeping the size and numbers: block, slider, then
// each cell shape in turn. Null after the last one, or without a bar.
export function stepBarStyle(item: WidgetItem): WidgetItem | null {
    const style = getBarStyle(item);
    if (style === 'block') {
        return setBarStyle(item, 'slider');
    }
    if (style === 'slider') {
        return setBarStyle(item, 'cells');
    }
    const next = style === 'cells' ? BAR_CELL_SHAPES[BAR_CELL_SHAPES.indexOf(getBarCellShape(item)) + 1] : undefined;
    return next ? setBarCellShape(item, next) : null;
}

export function setBarSize(item: WidgetItem, size: BarSize): WidgetItem {
    return writeBarLayout(item, getBarStyle(item) ?? 'block', size, getBarNumbers(item));
}

function setBarNumbers(item: WidgetItem, numbers: BarNumbers): WidgetItem {
    return writeBarLayout(item, getBarStyle(item) ?? 'block', getBarSize(item), numbers);
}

// (n) on a bar with only a percent after it: on or off
export function toggleBarNumbers(item: WidgetItem): WidgetItem {
    return setBarNumbers(item, showsBarPercent(item) ? 'none' : 'all');
}

// (n) on the Context Bar: both numbers, the percent only, the counts only, none
export function cycleBarNumbers(item: WidgetItem): WidgetItem {
    const next = BAR_NUMBERS[(BAR_NUMBERS.indexOf(getBarNumbers(item)) + 1) % BAR_NUMBERS.length] ?? 'all';
    return setBarNumbers(item, next);
}

// Leaving the bar for the text mode, the size and numbers setting are stored
// outright, since the display mode that implied them goes, so (p) brings the
// bar back as it was. It comes back in the first style (p) offers, so a cell
// shape goes.
export function keepBarLayout(item: WidgetItem): WidgetItem {
    const cleared = removeMetadataKeys(item, ['barWidth', BAR_NUMBERS_KEY, BAR_ONLY_KEY, BAR_CELL_KEY]);
    return {
        ...cleared,
        metadata: {
            ...cleared.metadata,
            barWidth: String(getBarSize(item)),
            ...getBarNumbersMetadata(getBarNumbers(item))
        }
    };
}

// The line editor's modifiers, e.g. "slider bar" or "cells ■", "long",
// "numbers off"; none while the widget shows text
export function getBarLayoutModifiers(item: WidgetItem): string[] {
    const style = getBarStyle(item);
    if (style === null) {
        return [];
    }
    const numbersModifier = BAR_NUMBERS_MODIFIERS[getBarNumbers(item)];
    const styleModifier = style === 'cells' ? `cells ${getBarCellGlyph(item)}` : `${style} bar`;
    return [styleModifier, getBarSizeModifier(item), ...(numbersModifier ? [numbersModifier] : [])];
}

// A toggle for a bar with only a percent after it, a cycle for one with counts too
export function getBarNumbersKeybinds(item: WidgetItem | undefined, showsBar: boolean, withCounts = false): CustomKeybind[] {
    if (!showsBar) {
        return [];
    }
    if (withCounts) {
        return [{ key: 'n', label: '(n)umbers', action: CYCLE_BAR_NUMBERS_ACTION }];
    }
    const label = item && !showsBarPercent(item) ? '(n) show numbers' : '(n) hide numbers';
    return [{ key: 'n', label, action: TOGGLE_BAR_NUMBERS_ACTION }];
}
