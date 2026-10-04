import type { RenderContext } from '../../types/RenderContext';
import type { Settings } from '../../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../../types/Widget';
import {
    formatPercent,
    resolveNumberFormat
} from '../../utils/number-format';

import {
    getContextInverseModifierText,
    handleContextInverseAction,
    isContextInverse
} from './context-inverse';
import {
    getContextSliderKeybinds,
    getContextSliderMode,
    getContextSliderModifierText,
    handleContextSliderAction,
    renderContextSlider
} from './context-slider';
import { paintWidgetBar } from './gradient-bar';
import { formatRawOrLabeledValue } from './raw-or-labeled';

// Context % and Context % (usable) differ only in their name, color, label, preview
// sample and how they measure the used share of the context window
export abstract class ContextPercentageWidgetBase implements Widget {
    abstract getDefaultColor(): string;
    abstract getDescription(): string;
    abstract getDisplayName(): string;

    // Shown before "Used: " or "Left: ", e.g. "Ctx"
    protected abstract readonly labelPrefix: string;
    // The used percentage the TUI preview shows
    protected abstract readonly previewUsedPercent: number;
    // The used percentage, or null without the data to measure it
    protected abstract getUsedPercentage(context: RenderContext): number | null;

    getCategory(): string { return 'Context'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const modifiers = [
            getContextInverseModifierText(item),
            getContextSliderModifierText(item)
        ].filter((m): m is string => m !== undefined);

        return {
            displayText: this.getDisplayName(),
            modifierText: modifiers.length > 0 ? `(${modifiers.map(m => m.replace(/^\(|\)$/g, '')).join(', ')})` : undefined
        };
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        return handleContextSliderAction(action, item) ?? handleContextInverseAction(action, item);
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const isInverse = isContextInverse(item);
        const label = `${this.labelPrefix} ${isInverse ? 'Left' : 'Used'}: `;
        const usedPercentage = context.isPreview ? this.previewUsedPercent : this.getUsedPercentage(context);
        if (usedPercentage === null) {
            return null;
        }

        const displayPercentage = isInverse ? 100 - usedPercentage : usedPercentage;
        const format = resolveNumberFormat('percent', item, settings);
        const slider = renderContextSlider(getContextSliderMode(item), displayPercentage, format);
        const sliderResult = slider === null ? null : paintWidgetBar(slider, item, settings, isInverse);
        return formatRawOrLabeledValue(item, label, sliderResult ?? formatPercent(displayPercentage, format));
    }

    getCustomKeybinds(item?: WidgetItem): CustomKeybind[] {
        return [
            { key: 'u', label: '(u)sed/remaining', action: 'toggle-inverse' },
            ...getContextSliderKeybinds(item)
        ];
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
    supportsNumberFormat(): boolean { return true; }
}
