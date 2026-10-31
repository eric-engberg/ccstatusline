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

// A widget's bar has a style (block "[███░░]" or slider "▓▓▓░░"), a size (see
// bar-width.ts) and the numbers after it, some or all of which can be turned
// off. They are stored in the display modes saved configs already use: block
// bars as 'progress' (long) or 'progress-short', sliders as 'slider', with
// barWidth only for a size the display mode doesn't already mean. The older
// 'slider-only' mode reads as a slider with its numbers off.
export type BarStyle = 'block' | 'slider';

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
    return display === 'slider' || display === 'slider-only' ? 'slider' : null;
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

function writeBarLayout(item: WidgetItem, style: BarStyle, size: BarSize, numbers: BarNumbers): WidgetItem {
    const display = style === 'block' ? getBlockDisplay(item, size) : 'slider';
    const barWidth = getBarSizeMetadata(size, getImpliedBarSize({ ...item, metadata: { display } }));
    const cleared = removeMetadataKeys(item, ['barWidth', BAR_NUMBERS_KEY, BAR_ONLY_KEY]);
    return {
        ...cleared,
        metadata: {
            ...cleared.metadata,
            display,
            ...(barWidth === null ? {} : { barWidth }),
            ...getBarNumbersMetadata(numbers)
        }
    };
}

// The bar keeps its size; from the text mode it takes the size it had last,
// or the one given
export function setBarStyle(item: WidgetItem, style: BarStyle, sizeFromText: BarSize = 'medium'): WidgetItem {
    const size = getBarStyle(item) === null ? (getStoredBarSize(item) ?? sizeFromText) : getBarSize(item);
    return writeBarLayout(item, style, size, getBarNumbers(item));
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
// bar back as it was
export function keepBarLayout(item: WidgetItem): WidgetItem {
    const cleared = removeMetadataKeys(item, ['barWidth', BAR_NUMBERS_KEY, BAR_ONLY_KEY]);
    return {
        ...cleared,
        metadata: {
            ...cleared.metadata,
            barWidth: String(getBarSize(item)),
            ...getBarNumbersMetadata(getBarNumbers(item))
        }
    };
}

// The line editor's modifiers, e.g. "slider bar", "long", "numbers off"; none
// while the widget shows text
export function getBarLayoutModifiers(item: WidgetItem): string[] {
    const style = getBarStyle(item);
    if (style === null) {
        return [];
    }
    const numbersModifier = BAR_NUMBERS_MODIFIERS[getBarNumbers(item)];
    return [`${style} bar`, getBarSizeModifier(item), ...(numbersModifier ? [numbersModifier] : [])];
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
