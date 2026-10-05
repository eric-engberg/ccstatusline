import type { NumberFormat } from '../../types/NumberFormat';
import type {
    CustomKeybind,
    WidgetItem
} from '../../types/Widget';
import { formatPercent } from '../../utils/number-format';

import {
    areBarNumbersShown,
    getBarLayoutModifiers,
    getBarNumbersKeybinds,
    keepBarLayout,
    setBarStyle
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
import { makeSliderBar } from './usage-display';

export type ContextSliderMode = 'none' | 'slider' | 'slider-only';

const SLIDER_TOGGLE_KEYBIND: CustomKeybind = { key: 'p', label: '(p) bar style', action: 'toggle-slider' };

export function getContextSliderMode(item: WidgetItem): ContextSliderMode {
    const mode = item.metadata?.display;
    if (mode === 'slider' || mode === 'slider-only') {
        return mode;
    }
    return 'none';
}

// (p) switches between the percentage and a slider, which keeps the size it had
export function cycleContextSliderMode(item: WidgetItem): WidgetItem {
    if (getContextSliderMode(item) === 'none') {
        return setBarStyle(item, 'slider', 'short');
    }

    const nextMetadata = { ...keepBarLayout(item).metadata };
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
    const slider = makeSliderBar(percent, cells ?? getFixedBarCells(item));
    return areBarNumbersShown(item) ? `${slider} ${formatPercent(percent, format)}` : slider;
}

export function getContextSliderModifierText(item: WidgetItem): string | undefined {
    if (getContextSliderMode(item) === 'none') {
        return undefined;
    }
    const modifiers = [...getBarLayoutModifiers(item), getGradientModifier(item)]
        .filter((modifier): modifier is string => modifier !== null);
    return `(${modifiers.join(', ')})`;
}

export function getContextSliderKeybinds(item?: WidgetItem): CustomKeybind[] {
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
