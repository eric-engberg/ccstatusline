import { getColorLevelString } from '../types/ColorLevel';
import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { getContextWindowMetrics } from '../utils/context-window';
import {
    getContextConfig,
    getModelContextIdentifier
} from '../utils/model-context';
import {
    formatPercent,
    resolveNumberFormat
} from '../utils/number-format';
import { formatTokens } from '../utils/renderer';
import { makeUsageProgressBar } from '../utils/usage';

import {
    BAR_GRADIENT_PRESETS,
    isBarGradientPreset,
    paintGradientBar,
    type BarGradientPreset
} from './shared/gradient-bar';
import { removeMetadataKeys } from './shared/metadata';
import { makeSliderBar } from './shared/usage-display';

type DisplayMode = 'progress' | 'progress-short' | 'slider' | 'slider-only';

function getDisplayMode(item: WidgetItem): DisplayMode {
    const mode = item.metadata?.display;
    if (mode === 'progress' || mode === 'slider' || mode === 'slider-only') {
        return mode;
    }
    return 'progress-short';
}

function isBarSliderMode(mode: DisplayMode): boolean {
    return mode === 'slider' || mode === 'slider-only';
}

// Nearly full, so the TUI preview shows most of a gradient preset's range
const PREVIEW_USED_TOKENS = 180000;
const PREVIEW_WINDOW_TOKENS = 200000;
const PREVIEW_PERCENT = 90;

const GRADIENT_KEY = 'gradient';

// "true" is the earlier on/off setting, from before there were presets
function getGradientPreset(item: WidgetItem): BarGradientPreset | null {
    const value = item.metadata?.[GRADIENT_KEY];
    if (value === 'true') {
        return 'traffic';
    }
    return isBarGradientPreset(value) ? value : null;
}

// Off, then each preset in turn, then off again
function cycleGradientPreset(item: WidgetItem): WidgetItem {
    const current = getGradientPreset(item);
    const next = current === null ? BAR_GRADIENT_PRESETS[0] : BAR_GRADIENT_PRESETS[BAR_GRADIENT_PRESETS.indexOf(current) + 1];
    if (!next) {
        return removeMetadataKeys(item, [GRADIENT_KEY]);
    }
    return { ...item, metadata: { ...(item.metadata ?? {}), [GRADIENT_KEY]: next } };
}

// The gradient needs colors, and a global foreground override owns every
// widget's foreground
function paintBar(bar: string, item: WidgetItem, settings: Settings): string {
    const preset = getGradientPreset(item);
    const override = settings.overrideForegroundColor;
    if (!preset || settings.colorLevel === 0 || (override && override !== 'none')) {
        return bar;
    }
    return paintGradientBar(bar, getColorLevelString(settings.colorLevel), preset);
}

export class ContextBarWidget implements Widget {
    getDefaultColor(): string { return 'blue'; }
    getDescription(): string { return 'Shows context usage as a progress bar'; }
    getDisplayName(): string { return 'Context Bar'; }
    getCategory(): string { return 'Context'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const mode = getDisplayMode(item);
        const modifiers: string[] = [];

        if (mode === 'progress-short') {
            modifiers.push('medium bar');
        } else if (mode === 'slider') {
            modifiers.push('short bar');
        } else if (mode === 'slider-only') {
            modifiers.push('short bar only');
        }
        const preset = getGradientPreset(item);
        if (preset) {
            modifiers.push(`gradient: ${preset}`);
        }

        return {
            displayText: this.getDisplayName(),
            modifierText: modifiers.length > 0 ? `(${modifiers.join(', ')})` : undefined
        };
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action === 'cycle-gradient') {
            return cycleGradientPreset(item);
        }
        if (action !== 'toggle-progress') {
            return null;
        }

        const currentMode = getDisplayMode(item);
        const nextMode: DisplayMode = currentMode === 'progress-short'
            ? 'progress'
            : currentMode === 'progress'
                ? 'slider'
                : currentMode === 'slider'
                    ? 'slider-only'
                    : 'progress-short';

        return {
            ...item,
            metadata: {
                ...(item.metadata ?? {}),
                display: nextMode
            }
        };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const displayMode = getDisplayMode(item);
        const tokenFormat = resolveNumberFormat('token', item, settings);
        const percentFormat = resolveNumberFormat('percent', item, settings);

        if (context.isPreview) {
            const usedDisplay = formatTokens(PREVIEW_USED_TOKENS, tokenFormat, 0);
            const totalDisplay = formatTokens(PREVIEW_WINDOW_TOKENS, tokenFormat, 0);
            const percentDisplay = formatPercent(PREVIEW_PERCENT, percentFormat, 0);
            if (isBarSliderMode(displayMode)) {
                const slider = paintBar(makeSliderBar(PREVIEW_PERCENT), item, settings);
                const sliderDisplay = displayMode === 'slider' ? `${slider} ${usedDisplay}/${totalDisplay} (${percentDisplay})` : slider;
                return item.rawValue ? sliderDisplay : `Context: ${sliderDisplay}`;
            }
            const barWidth = displayMode === 'progress' ? 32 : 16;
            const previewDisplay = `${paintBar(makeUsageProgressBar(PREVIEW_PERCENT, barWidth), item, settings)} ${usedDisplay}/${totalDisplay} (${percentDisplay})`;
            return item.rawValue ? previewDisplay : `Context: ${previewDisplay}`;
        }

        const contextWindowMetrics = getContextWindowMetrics(context.data);

        let total = contextWindowMetrics.windowSize;
        let used = contextWindowMetrics.contextLengthTokens;

        if (used === null && context.tokenMetrics) {
            used = context.tokenMetrics.contextLength;
        }

        if (total === null && context.tokenMetrics) {
            const modelIdentifier = getModelContextIdentifier(context.data?.model);
            total = getContextConfig(modelIdentifier).maxTokens;
        }

        if (used === null || total === null || total <= 0) {
            return null;
        }

        const percent = (used / total) * 100;
        const clampedPercent = Math.max(0, Math.min(100, percent));
        const usedDisplay = formatTokens(used, tokenFormat, 0);
        const totalDisplay = formatTokens(total, tokenFormat, 0);
        const percentDisplay = formatPercent(clampedPercent, percentFormat, 0);

        if (isBarSliderMode(displayMode)) {
            const slider = paintBar(makeSliderBar(clampedPercent), item, settings);
            const sliderDisplay = displayMode === 'slider' ? `${slider} ${usedDisplay}/${totalDisplay} (${percentDisplay})` : slider;
            return item.rawValue ? sliderDisplay : `Context: ${sliderDisplay}`;
        }

        const barWidth = displayMode === 'progress' ? 32 : 16;
        const display = `${paintBar(makeUsageProgressBar(clampedPercent, barWidth), item, settings)} ${usedDisplay}/${totalDisplay} (${percentDisplay})`;

        return item.rawValue ? display : `Context: ${display}`;
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [
            { key: 'p', label: '(p)rogress toggle', action: 'toggle-progress' },
            { key: 'g', label: '(g)radient', action: 'cycle-gradient' }
        ];
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
    supportsNumberFormat(): boolean { return true; }
}
