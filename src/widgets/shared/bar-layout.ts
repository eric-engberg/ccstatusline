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
// bar-width.ts) and the numbers after it, which can be turned off. They are
// stored in the display modes saved configs already use: block bars as
// 'progress' (long) or 'progress-short', sliders as 'slider', with barWidth
// only for a size the display mode doesn't already mean. The older
// 'slider-only' mode reads as a slider with its numbers off.
export type BarStyle = 'block' | 'slider';

const BAR_ONLY_KEY = 'barOnly';
export const TOGGLE_BAR_NUMBERS_ACTION = 'toggle-bar-numbers';

/** The bar's style, or null when the widget shows text instead. */
export function getBarStyle(item: WidgetItem): BarStyle | null {
    const display = item.metadata?.display;
    if (display === 'progress' || display === 'progress-short') {
        return 'block';
    }
    return display === 'slider' || display === 'slider-only' ? 'slider' : null;
}

export function areBarNumbersShown(item: WidgetItem): boolean {
    return item.metadata?.[BAR_ONLY_KEY] !== 'true' && item.metadata?.display !== 'slider-only';
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

function writeBarLayout(item: WidgetItem, style: BarStyle, size: BarSize, numbersShown: boolean): WidgetItem {
    const display = style === 'block' ? getBlockDisplay(item, size) : 'slider';
    const barWidth = getBarSizeMetadata(size, getImpliedBarSize({ ...item, metadata: { display } }));
    const cleared = removeMetadataKeys(item, ['barWidth', BAR_ONLY_KEY]);
    return {
        ...cleared,
        metadata: {
            ...cleared.metadata,
            display,
            ...(barWidth === null ? {} : { barWidth }),
            ...(numbersShown ? {} : { [BAR_ONLY_KEY]: 'true' })
        }
    };
}

// The bar keeps its size; from the text mode it takes the size it had last,
// or the one given
export function setBarStyle(item: WidgetItem, style: BarStyle, sizeFromText: BarSize = 'medium'): WidgetItem {
    const size = getBarStyle(item) === null ? (getStoredBarSize(item) ?? sizeFromText) : getBarSize(item);
    return writeBarLayout(item, style, size, areBarNumbersShown(item));
}

export function setBarSize(item: WidgetItem, size: BarSize): WidgetItem {
    return writeBarLayout(item, getBarStyle(item) ?? 'block', size, areBarNumbersShown(item));
}

export function toggleBarNumbers(item: WidgetItem): WidgetItem {
    return writeBarLayout(item, getBarStyle(item) ?? 'block', getBarSize(item), !areBarNumbersShown(item));
}

// Leaving the bar for the text mode, the size and numbers setting are stored
// outright, since the display mode that implied them goes, so (p) brings the
// bar back as it was
export function keepBarLayout(item: WidgetItem): WidgetItem {
    const cleared = removeMetadataKeys(item, ['barWidth', BAR_ONLY_KEY]);
    return {
        ...cleared,
        metadata: {
            ...cleared.metadata,
            barWidth: String(getBarSize(item)),
            ...(areBarNumbersShown(item) ? {} : { [BAR_ONLY_KEY]: 'true' })
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
    return [`${style} bar`, getBarSizeModifier(item), ...(areBarNumbersShown(item) ? [] : ['numbers off'])];
}

export function getBarNumbersKeybinds(item: WidgetItem | undefined, showsBar: boolean): CustomKeybind[] {
    if (!showsBar) {
        return [];
    }
    const label = item && !areBarNumbersShown(item) ? '(n) show numbers' : '(n) hide numbers';
    return [{ key: 'n', label, action: TOGGLE_BAR_NUMBERS_ACTION }];
}
