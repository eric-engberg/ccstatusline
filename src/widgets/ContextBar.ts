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
    areBarNumbersShown,
    getBarLayoutModifiers,
    getBarNumbersKeybinds,
    getBarStyle,
    setBarStyle
} from './shared/bar-layout';
import {
    getBarWidthKeybinds,
    getFixedBarCells
} from './shared/bar-width';
import {
    CYCLE_GRADIENT_ACTION,
    cycleGradientPreset,
    getGradientKeybinds,
    getGradientModifier,
    paintWidgetBar
} from './shared/gradient-bar';
import { makeSliderBar } from './shared/usage-display';

// Context Bar always shows a bar; with no display mode saved, it's a medium
// block bar
function withBarDisplay(item: WidgetItem): WidgetItem {
    return getBarStyle(item) === null ? { ...item, metadata: { ...item.metadata, display: 'progress-short' } } : item;
}

// Nearly full, so the TUI preview shows most of a gradient preset's range
const PREVIEW_USED_TOKENS = 180000;
const PREVIEW_WINDOW_TOKENS = 200000;
const PREVIEW_PERCENT = 90;

export class ContextBarWidget implements Widget {
    getDefaultColor(): string { return 'blue'; }
    getDescription(): string { return 'Shows context usage as a progress bar'; }
    getDisplayName(): string { return 'Context Bar'; }
    getCategory(): string { return 'Context'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const modifiers = [...getBarLayoutModifiers(withBarDisplay(item)), getGradientModifier(item)]
            .filter((modifier): modifier is string => modifier !== null);

        return {
            displayText: this.getDisplayName(),
            modifierText: `(${modifiers.join(', ')})`
        };
    }

    // (p) switches between a block bar and a slider, which keep their size
    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action === CYCLE_GRADIENT_ACTION) {
            return cycleGradientPreset(item);
        }
        if (action !== 'toggle-progress') {
            return null;
        }
        const barItem = withBarDisplay(item);
        return setBarStyle(barItem, getBarStyle(barItem) === 'block' ? 'slider' : 'block');
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const tokenFormat = resolveNumberFormat('token', item, settings);
        const percentFormat = resolveNumberFormat('percent', item, settings);

        if (context.isPreview) {
            const numbers = `${formatTokens(PREVIEW_USED_TOKENS, tokenFormat, 0)}/${formatTokens(PREVIEW_WINDOW_TOKENS, tokenFormat, 0)} (${formatPercent(PREVIEW_PERCENT, percentFormat, 0)})`;
            return this.formatBar(item, PREVIEW_PERCENT, numbers, settings, context);
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

        const clampedPercent = Math.max(0, Math.min(100, (used / total) * 100));
        const numbers = `${formatTokens(used, tokenFormat, 0)}/${formatTokens(total, tokenFormat, 0)} (${formatPercent(clampedPercent, percentFormat, 0)})`;
        return this.formatBar(item, clampedPercent, numbers, settings, context);
    }

    // "[████░░░░] 50k/200k (25%)" or "▓▓▓▓░░░░", in the bar's style and size
    private formatBar(item: WidgetItem, percent: number, numbers: string, settings: Settings, context: RenderContext): string {
        const barItem = withBarDisplay(item);
        const cells = context.barCells ?? getFixedBarCells(barItem);
        const bar = getBarStyle(barItem) === 'slider' ? makeSliderBar(percent, cells) : makeUsageProgressBar(percent, cells);
        const painted = paintWidgetBar(bar, item, settings);
        const display = areBarNumbersShown(barItem) ? `${painted} ${numbers}` : painted;
        return item.rawValue ? display : `Context: ${display}`;
    }

    getCustomKeybinds(item?: WidgetItem): CustomKeybind[] {
        return [
            { key: 'p', label: '(p) bar style', action: 'toggle-progress' },
            ...getGradientKeybinds(true),
            ...getBarWidthKeybinds(true),
            ...getBarNumbersKeybinds(item, true)
        ];
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
    supportsNumberFormat(): boolean { return true; }
}
