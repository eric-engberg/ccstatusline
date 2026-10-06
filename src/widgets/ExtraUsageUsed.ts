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
    title: 'Extra Usage Used: value colors',
    scale: LIMIT_SCALE,
    sampleNote: 'of the limit',
    defaultColor: DEFAULT_COLOR,
    maxPercent: 100
};
// The preview's $106.00 of a limit that leaves Remaining's $3,894.00 sample
const PREVIEW_PERCENT = 106 / 4000 * 100;

const LABEL = 'Overage Used: ';

export class ExtraUsageUsedWidget implements Widget {
    getDefaultColor(): string { return DEFAULT_COLOR; }
    getDescription(): string { return 'Shows extra usage spent: overage beyond Pro/Max plan limits, or your spend on Enterprise'; }
    getDisplayName(): string { return 'Extra Usage Used'; }
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
            return formatColoredValue(item, this.getLabelPrefix(), formatUsageCurrency(106, undefined, format), PREVIEW_PERCENT, LIMIT_SCALE, formatOptions);
        }

        const data = context.usageData ?? {};
        if (data.extraUsageEnabled === false) {
            return isHidden(item, EXTRA_USAGE_DISABLED_HIDEABLE_STATE.key)
                ? null
                : formatRawOrLabeledValue(item, this.getLabelPrefix(), 'n/a');
        }
        if (data.extraUsageEnabled !== true || data.extraUsageUsed === undefined) {
            if (data.error) {
                return isHidden(item, USAGE_NO_DATA_HIDEABLE_STATE.key)
                    ? null
                    : getUsageErrorMessage(data.error);
            }
            return null;
        }

        // extraUsageUsed is in cents
        const usedDollars = data.extraUsageUsed / 100;
        const formatted = formatUsageCurrency(usedDollars, data.extraUsageCurrency, format);
        // Without a monthly limit there's nothing to measure the spend against
        const limit = data.extraUsageLimit ?? 0;
        const percent = limit > 0 ? data.extraUsageUsed / limit * 100 : null;

        return formatColoredValue(item, this.getLabelPrefix(), formatted, percent, LIMIT_SCALE, formatOptions);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
    supportsNumberFormat(): boolean { return true; }
}
