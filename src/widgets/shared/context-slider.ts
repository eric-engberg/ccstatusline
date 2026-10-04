import type { NumberFormat } from '../../types/NumberFormat';
import type {
    CustomKeybind,
    WidgetItem
} from '../../types/Widget';
import { formatPercent } from '../../utils/number-format';

import {
    getBarWidthKeybinds,
    getBarWidthModifier
} from './bar-width';
import {
    CYCLE_GRADIENT_ACTION,
    cycleGradientPreset,
    getGradientKeybinds,
    getGradientModifier
} from './gradient-bar';
import { makeSliderBar } from './usage-display';

export type ContextSliderMode = 'none' | 'slider' | 'slider-only';

const SLIDER_TOGGLE_KEYBIND: CustomKeybind = { key: 'p', label: '(p)rogress toggle', action: 'toggle-slider' };

export function getContextSliderMode(item: WidgetItem): ContextSliderMode {
    const mode = item.metadata?.display;
    if (mode === 'slider' || mode === 'slider-only') {
        return mode;
    }
    return 'none';
}

export function cycleContextSliderMode(item: WidgetItem): WidgetItem {
    const currentMode = getContextSliderMode(item);
    const nextMode: ContextSliderMode = currentMode === 'none'
        ? 'slider'
        : currentMode === 'slider'
            ? 'slider-only'
            : 'none';

    if (nextMode === 'none') {
        const nextMetadata = { ...(item.metadata ?? {}) };
        delete nextMetadata.display;
        return {
            ...item,
            metadata: Object.keys(nextMetadata).length > 0 ? nextMetadata : undefined
        };
    }

    return {
        ...item,
        metadata: {
            ...(item.metadata ?? {}),
            display: nextMode
        }
    };
}

export function renderContextSlider(mode: ContextSliderMode, percent: number, format: NumberFormat = {}, cells?: number): string | null {
    if (mode === 'none') {
        return null;
    }
    const slider = makeSliderBar(percent, cells);
    if (mode === 'slider') {
        return `${slider} ${formatPercent(percent, format)}`;
    }
    return slider;
}

export function getContextSliderModifierText(item: WidgetItem): string | undefined {
    const mode = getContextSliderMode(item);
    if (mode === 'none') {
        return undefined;
    }
    const modifiers = [mode === 'slider' ? 'short bar' : 'short bar only', getBarWidthModifier(item), getGradientModifier(item)]
        .filter((modifier): modifier is string => modifier !== null);
    return `(${modifiers.join(', ')})`;
}

export function getContextSliderKeybinds(item?: WidgetItem): CustomKeybind[] {
    const showsBar = item ? getContextSliderMode(item) !== 'none' : false;
    return [SLIDER_TOGGLE_KEYBIND, ...getGradientKeybinds(showsBar), ...getBarWidthKeybinds(showsBar)];
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
