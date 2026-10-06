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
import { resolveNumberFormat } from '../utils/number-format';
import { getUsageErrorMessage } from '../utils/usage';

import { formatUsageCurrency } from './shared/currency';
import { makeModifierText } from './shared/editor-display';
import { EXTRA_USAGE_DISABLED_HIDEABLE_STATE } from './shared/extra-usage-disabled';
import { isHidden } from './shared/hideable';
import { formatRawOrLabeledValue } from './shared/raw-or-labeled';
import { USAGE_NO_DATA_HIDEABLE_STATE } from './shared/usage-display';
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
const VALUE_COLORS_EDITOR: ValueColorsEditorOptions = {
    title: 'Extra Usage Remaining: value colors',
    scale: LIMIT_SCALE,
    sampleNote: 'of the limit used',
    defaultColor: DEFAULT_COLOR,
    maxPercent: 100
};
// The preview's $3,894.00 left of a $4,000.00 limit
const PREVIEW_PERCENT = 106 / 4000 * 100;

const LABEL = 'Overage Left: ';

export class ExtraUsageRemainingWidget implements Widget {
    getDefaultColor(): string { return DEFAULT_COLOR; }
    getDescription(): string { return 'Shows what\'s left of your monthly extra usage limit (Pro/Max overage or Enterprise spend)'; }
    getDisplayName(): string { return 'Extra Usage Remaining'; }
    getCategory(): string { return 'Usage'; }
    getLabelPrefix(): string { return LABEL; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const valueColors = getValueColorsModifier(item);
        return { displayText: this.getDisplayName(), modifierText: makeModifierText(valueColors ? [valueColors] : []) };
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [VALUE_COLORS_KEYBIND];
    }

    renderEditor(props: WidgetEditorProps): React.ReactElement {
        return renderValueColorsEditor(props, VALUE_COLORS_EDITOR);
    }

    // Value colors embed their own foreground codes, so the renderer must
    // leave this widget's foreground alone while they're on
    preservesRenderedColors(item: WidgetItem): boolean {
        return isValueColorsEnabled(item);
    }

    getHideableStates(): HideableState[] {
        return [EXTRA_USAGE_DISABLED_HIDEABLE_STATE, USAGE_NO_DATA_HIDEABLE_STATE];
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const format = resolveNumberFormat('cost', item, settings);
        const formatOptions = getValueFormatOptions(settings, item.color ?? DEFAULT_COLOR);
        if (context.isPreview) {
            return formatColoredValue(item, this.getLabelPrefix(), formatUsageCurrency(3894, undefined, format), PREVIEW_PERCENT, LIMIT_SCALE, formatOptions);
        }

        const data = context.usageData ?? {};
        if (data.extraUsageEnabled === false) {
            return isHidden(item, EXTRA_USAGE_DISABLED_HIDEABLE_STATE.key)
                ? null
                : formatRawOrLabeledValue(item, this.getLabelPrefix(), 'n/a');
        }
        if (data.extraUsageEnabled !== true || data.extraUsageLimit === undefined || data.extraUsageUsed === undefined) {
            if (data.error) {
                return isHidden(item, USAGE_NO_DATA_HIDEABLE_STATE.key)
                    ? null
                    : getUsageErrorMessage(data.error);
            }
            return null;
        }

        // Both extraUsageLimit and extraUsageUsed are in cents
        const limitDollars = data.extraUsageLimit / 100;
        const usedDollars = data.extraUsageUsed / 100;
        const remaining = Math.max(0, limitDollars - usedDollars);
        const formatted = formatUsageCurrency(remaining, data.extraUsageCurrency, format);
        // Value colors measure the share of the limit used, as Extra Usage Used's do
        const usedPercent = data.extraUsageLimit > 0 ? data.extraUsageUsed / data.extraUsageLimit * 100 : null;

        return formatColoredValue(item, this.getLabelPrefix(), formatted, usedPercent, LIMIT_SCALE, formatOptions);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
    supportsNumberFormat(): boolean { return true; }
}
