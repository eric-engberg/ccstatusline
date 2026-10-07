import type React from 'react';

import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    HideableState,
    Widget,
    WidgetEditorDisplay,
    WidgetEditorProps,
    WidgetItem
} from '../types/Widget';
import {
    formatPercent,
    resolveNumberFormat
} from '../utils/number-format';
import { getUsageErrorMessage } from '../utils/usage';

import { EXTRA_USAGE_DISABLED_HIDEABLE_STATE } from './shared/extra-usage-disabled';
import {
    CYCLE_GRADIENT_ACTION,
    cycleGradientPreset
} from './shared/gradient-bar';
import { isHidden } from './shared/hideable';
import { formatRawOrLabeledValue } from './shared/raw-or-labeled';
import {
    USAGE_NO_DATA_HIDEABLE_STATE,
    cycleUsageDisplayMode,
    formatUsageBar,
    getUsageDisplayModifierText,
    getUsagePercentCustomKeybinds,
    isUsageInverted,
    showsUsageBar,
    toggleUsageInverted
} from './shared/usage-display';
import {
    LIMIT_SCALE,
    formatColoredValue,
    getValueColorsModifier,
    getValueFormatOptions,
    isValueColorsEnabled
} from './shared/value-coloring';
import {
    VALUE_COLORS_KEYBIND,
    renderValueColorsEditor,
    type ValueColorsEditorOptions
} from './shared/value-colors-editor';

const DEFAULT_COLOR = 'green';
const LABEL = 'Overage: ';
const VALUE_COLORS_EDITOR: ValueColorsEditorOptions = {
    title: 'Extra Usage Utilization: value colors',
    scale: LIMIT_SCALE,
    sampleNote: 'used',
    defaultColor: DEFAULT_COLOR,
    maxPercent: 100,
    label: LABEL
};

// Value colors apply to the plain percent; the bar modes have bar gradients
function showsValueColors(item: WidgetItem): boolean {
    return isValueColorsEnabled(item) && !showsUsageBar(item);
}

// The bar, or the percent in its value color. Value colors follow the used
// percent, even while the widget shows what's left.
function formatUsedPercent(item: WidgetItem, label: string, usedPercent: number, settings: Settings, context: RenderContext): string {
    const format = resolveNumberFormat('percent', item, settings);
    const renderedPercent = isUsageInverted(item) ? 100 - usedPercent : usedPercent;

    const bar = formatUsageBar(item, renderedPercent, format, settings, context);
    if (bar !== null) {
        return formatRawOrLabeledValue(item, label, bar);
    }

    const formatOptions = getValueFormatOptions(settings);
    return formatColoredValue(item, label, formatPercent(renderedPercent, format), usedPercent, LIMIT_SCALE, formatOptions);
}

export class ExtraUsageUtilizationWidget implements Widget {
    getDefaultColor(): string { return DEFAULT_COLOR; }
    getDescription(): string { return 'Shows extra usage as a percentage of your monthly limit (Pro/Max overage or Enterprise spend)'; }
    getDisplayName(): string { return 'Extra Usage Utilization'; }
    getCategory(): string { return 'Usage'; }
    getLabelPrefix(): string { return LABEL; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return {
            displayText: this.getDisplayName(),
            modifierText: getUsageDisplayModifierText(item, {
                showUsageDirection: true,
                extraModifiers: showsUsageBar(item) ? [] : [getValueColorsModifier(item)].filter((modifier): modifier is string => modifier !== null)
            })
        };
    }

    getHideableStates(): HideableState[] {
        return [EXTRA_USAGE_DISABLED_HIDEABLE_STATE, USAGE_NO_DATA_HIDEABLE_STATE];
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action === CYCLE_GRADIENT_ACTION) {
            return cycleGradientPreset(item);
        }

        if (action === 'toggle-progress') {
            return cycleUsageDisplayMode(item, [], true, true);
        }

        if (action === 'toggle-invert') {
            return toggleUsageInverted(item);
        }

        return null;
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview) {
            return formatUsedPercent(item, this.getLabelPrefix(), 85, settings, context);
        }

        const data = context.usageData ?? {};
        if (data.extraUsageEnabled === false) {
            return isHidden(item, EXTRA_USAGE_DISABLED_HIDEABLE_STATE.key)
                ? null
                : formatRawOrLabeledValue(item, this.getLabelPrefix(), 'n/a');
        }
        if (data.extraUsageEnabled !== true || data.extraUsageUtilization === undefined) {
            if (data.error) {
                return isHidden(item, USAGE_NO_DATA_HIDEABLE_STATE.key)
                    ? null
                    : getUsageErrorMessage(data.error);
            }
            return null;
        }

        // extraUsageUtilization is already a percentage (0-100), not a fraction
        return formatUsedPercent(item, this.getLabelPrefix(), Math.max(0, Math.min(100, data.extraUsageUtilization)), settings, context);
    }

    getCustomKeybinds(item?: WidgetItem): CustomKeybind[] {
        const keybinds = getUsagePercentCustomKeybinds(item, false);
        return item && showsUsageBar(item) ? keybinds : [...keybinds, VALUE_COLORS_KEYBIND];
    }

    renderEditor(props: WidgetEditorProps): React.ReactElement {
        return renderValueColorsEditor(props, VALUE_COLORS_EDITOR);
    }

    // Value colors paint only the value (or the whole text), so the renderer
    // colors the rest with the theme or widget color
    colorsOnlyItsRuns(item: WidgetItem): boolean {
        return showsValueColors(item);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
    supportsNumberFormat(): boolean { return true; }
}
