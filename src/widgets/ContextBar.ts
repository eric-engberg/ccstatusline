import type React from 'react';

import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetEditorProps,
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

import { drawWidgetBar } from './shared/bar-draw';
import {
    getBarEmptyCellsKeybinds,
    getBarLayoutModifiers,
    getBarNumbersKeybinds,
    getBarStyle,
    setBarStyle,
    showsBarCounts,
    showsBarPercent,
    stepBarStyle
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
    paintsBarCells
} from './shared/gradient-bar';
import {
    LIMIT_SCALE,
    formatColoredValue,
    getValueColorsModifier,
    getValueFormatOptions,
    isValueColorsEnabled
} from './shared/value-coloring';
import {
    VALUE_COLORS_KEYBIND,
    renderValueColorsEditor
} from './shared/value-colors-editor';

const LABEL = 'Context: ';
const DEFAULT_COLOR = 'blue';

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
    getDefaultColor(): string { return DEFAULT_COLOR; }
    getDescription(): string { return 'Shows context usage as a progress bar'; }
    getDisplayName(): string { return 'Context Bar'; }
    getCategory(): string { return 'Context'; }
    getLabelPrefix(): string { return LABEL; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const modifiers = [...getBarLayoutModifiers(withBarDisplay(item)), getGradientModifier(item), getValueColorsModifier(item)]
            .filter((modifier): modifier is string => modifier !== null);

        return {
            displayText: this.getDisplayName(),
            modifierText: `(${modifiers.join(', ')})`
        };
    }

    // (p) steps through a block bar, a slider and the cell bars in each shape,
    // then back to the block bar, all at the same size
    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action === CYCLE_GRADIENT_ACTION) {
            return cycleGradientPreset(item);
        }
        if (action !== 'toggle-progress') {
            return null;
        }
        const barItem = withBarDisplay(item);
        return stepBarStyle(barItem) ?? setBarStyle(barItem, 'block');
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const tokenFormat = resolveNumberFormat('token', item, settings);
        const percentFormat = resolveNumberFormat('percent', item, settings);

        if (context.isPreview) {
            const counts = `${formatTokens(PREVIEW_USED_TOKENS, tokenFormat, 0)}/${formatTokens(PREVIEW_WINDOW_TOKENS, tokenFormat, 0)}`;
            return this.formatBar(item, PREVIEW_PERCENT, counts, formatPercent(PREVIEW_PERCENT, percentFormat, 0), settings, context);
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
        const counts = `${formatTokens(used, tokenFormat, 0)}/${formatTokens(total, tokenFormat, 0)}`;
        return this.formatBar(item, clampedPercent, counts, formatPercent(clampedPercent, percentFormat, 0), settings, context);
    }

    // "[████░░░░] 50k/200k (25%)", "▓▓▓▓░░░░ 25%", "▮▮▮▮▮▮▮▮" and so on: the bar in its style
    // and size, then the numbers that are on. Value colors give the bar and its
    // numbers the color of how much of the context is used.
    private formatBar(item: WidgetItem, percent: number, counts: string, percentText: string, settings: Settings, context: RenderContext): string {
        const barItem = withBarDisplay(item);
        const cells = context.barCells ?? getFixedBarCells(barItem);
        const bar = drawWidgetBar(barItem, percent, cells, settings);
        const showsCounts = showsBarCounts(barItem);
        const showsPercent = showsBarPercent(barItem);
        let numbers = showsCounts ? counts : percentText;
        if (showsCounts && showsPercent) {
            numbers = `${counts} (${percentText})`;
        }
        const display = showsCounts || showsPercent ? `${bar} ${numbers}` : bar;
        return formatColoredValue(item, this.getLabelPrefix(), display, percent, LIMIT_SCALE, getValueFormatOptions(settings));
    }

    getCustomKeybinds(item?: WidgetItem): CustomKeybind[] {
        return [
            { key: 'p', label: '(p) bar style', action: 'toggle-progress' },
            ...getGradientKeybinds(true),
            ...getBarWidthKeybinds(true),
            ...getBarNumbersKeybinds(item, true, true),
            ...getBarEmptyCellsKeybinds(item),
            VALUE_COLORS_KEYBIND
        ];
    }

    renderEditor(props: WidgetEditorProps): React.ReactElement {
        return renderValueColorsEditor(props, {
            title: 'Context Bar: value colors',
            scale: LIMIT_SCALE,
            sampleNote: 'used',
            defaultColor: DEFAULT_COLOR,
            maxPercent: 100,
            label: LABEL
        });
    }

    // Value colors paint only the bar and its numbers (or the whole text), and
    // a gradient preset or gray empty cells only the bar, so the renderer
    // colors the rest with the theme or widget color
    colorsOnlyItsRuns(item: WidgetItem): boolean {
        return isValueColorsEnabled(item) || paintsBarCells(item, true);
    }

    supportsRawValue(): boolean { return true; }

    supportsColors(item: WidgetItem): boolean { return true; }
    supportsNumberFormat(): boolean { return true; }
}
