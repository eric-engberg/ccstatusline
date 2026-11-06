import type { NumberFormat } from '../../types/NumberFormat';
import type {
    CustomKeybind,
    WidgetItem
} from '../../types/Widget';
import { formatPercent } from '../../utils/number-format';

import {
    getBarLayoutModifiers,
    getBarNumbersKeybinds,
    getBarStyle,
    keepBarLayout,
    setBarStyle,
    showsBarPercent
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
import { makeLineProgressBar } from './progress-bar';
import { makeSliderBar } from './usage-display';

export type ContextSliderMode = 'none' | 'slider' | 'slider-only' | 'line';

const SLIDER_TOGGLE_KEYBIND: CustomKeybind = { key: 'p', label: '(p) bar style', action: 'toggle-slider' };

export function getContextSliderMode(item: WidgetItem): ContextSliderMode {
    const mode = item.metadata?.display;
    if (mode === 'slider' || mode === 'slider-only' || mode === 'line') {
        return mode;
    }
    return 'none';
}

// (p) cycles the percentage, a slider, a line and the level glyph. The bar
// keeps the size it had through the others.
export function cycleContextSliderMode(item: WidgetItem): WidgetItem {
    const mode = getContextSliderMode(item);
    if (mode !== 'none' && getBarStyle(item) !== 'line') {
        return setBarStyle(item, 'line');
    }
    if (mode !== 'none') {
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

export function renderContextSlider(item: WidgetItem, percent: number, format: NumberFormat = {}, cells?: number): string | null {
    if (getContextSliderMode(item) === 'none') {
        return null;
    }
    const barCells = cells ?? getFixedBarCells(item);
    const bar = getBarStyle(item) === 'line' ? makeLineProgressBar(percent, barCells) : makeSliderBar(percent, barCells);
    return showsBarPercent(item) ? `${bar} ${formatPercent(percent, format)}` : bar;
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
