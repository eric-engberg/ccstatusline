import type { NumberFormat } from '../../types/NumberFormat';
import type { Settings } from '../../types/Settings';
import type {
    CustomKeybind,
    WidgetItem
} from '../../types/Widget';
import { formatPercent } from '../../utils/number-format';

import { drawWidgetBar } from './bar-draw';
import {
    getBarLayoutModifiers,
    getBarNumbersKeybinds,
    keepBarLayout,
    setBarStyle,
    showsBarPercent,
    stepBarStyle
} from './bar-layout';
import {
    getBarWidthKeybinds,
    getFixedBarCells
} from './bar-width';
import {
    CYCLE_GRADIENT_ACTION,
    cycleGradientPreset,
    getGradientKeybinds,
    getGradientModifier
} from './gradient-bar';
import {
    LEVEL_GLYPH_DISPLAY,
    getLevelGlyphKeybinds,
    isLevelGlyphMode
} from './level-glyph';

// The percentage, or a bar: a slider, or a cell bar in one of its shapes
export type ContextSliderMode = 'none' | 'slider' | 'slider-only' | 'cells';

const SLIDER_TOGGLE_KEYBIND: CustomKeybind = { key: 'p', label: '(p) bar style', action: 'toggle-slider' };

export function getContextSliderMode(item: WidgetItem): ContextSliderMode {
    const mode = item.metadata?.display;
    if (mode === 'slider' || mode === 'slider-only' || mode === 'cells') {
        return mode;
    }
    return 'none';
}

// (p) cycles the percentage, a slider, the cell bars in each shape and the
// level glyph, the order the usage widgets have after their block bar. The
// bar keeps the size it had through all of them.
export function cycleContextSliderMode(item: WidgetItem): WidgetItem {
    if (getContextSliderMode(item) !== 'none') {
        const nextStyle = stepBarStyle(item);
        if (nextStyle) {
            return nextStyle;
        }
        const kept = keepBarLayout(item);
        return { ...kept, metadata: { ...kept.metadata, display: LEVEL_GLYPH_DISPLAY } };
    }
    if (!isLevelGlyphMode(item)) {
        return setBarStyle(item, 'slider', 'short');
    }

    const nextMetadata = { ...item.metadata };
    delete nextMetadata.display;
    return {
        ...item,
        metadata: Object.keys(nextMetadata).length > 0 ? nextMetadata : undefined
    };
}

// The bar and the percent after it, painted with the widget's gradient
// preset; reversed when it fills with what's left
export function renderContextSlider(item: WidgetItem, percent: number, settings: Settings, format: NumberFormat = {}, cells?: number, reversed = false): string | null {
    if (getContextSliderMode(item) === 'none') {
        return null;
    }
    const slider = drawWidgetBar(item, percent, cells ?? getFixedBarCells(item), settings, { reversed });
    return showsBarPercent(item) ? `${slider} ${formatPercent(percent, format)}` : slider;
}

export function getContextSliderModifierText(item: WidgetItem): string | undefined {
    if (isLevelGlyphMode(item)) {
        return '(level glyph)';
    }
    if (getContextSliderMode(item) === 'none') {
        return undefined;
    }
    const modifiers = [...getBarLayoutModifiers(item), getGradientModifier(item)]
        .filter((modifier): modifier is string => modifier !== null);
    return `(${modifiers.join(', ')})`;
}

export function getContextSliderKeybinds(item?: WidgetItem): CustomKeybind[] {
    if (item && isLevelGlyphMode(item)) {
        return [SLIDER_TOGGLE_KEYBIND, ...getLevelGlyphKeybinds()];
    }
    const showsBar = item ? getContextSliderMode(item) !== 'none' : false;
    return [SLIDER_TOGGLE_KEYBIND, ...getGradientKeybinds(showsBar), ...getBarWidthKeybinds(showsBar), ...getBarNumbersKeybinds(item, showsBar)];
}

// The slider and gradient actions; null for anything else
export function handleContextSliderAction(action: string, item: WidgetItem): WidgetItem | null {
    if (action === 'toggle-slider') {
        return cycleContextSliderMode(item);
    }
    if (action === CYCLE_GRADIENT_ACTION) {
        return cycleGradientPreset(item);
    }
    return null;
}
