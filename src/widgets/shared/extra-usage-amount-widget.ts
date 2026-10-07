import type React from 'react';

import type {
    RenderContext,
    RenderUsageData
} from '../../types/RenderContext';
import type { Settings } from '../../types/Settings';
import type {
    CustomKeybind,
    HideableState,
    Widget,
    WidgetEditorDisplay,
    WidgetEditorProps,
    WidgetItem
} from '../../types/Widget';
import { resolveNumberFormat } from '../../utils/number-format';
import { getUsageErrorMessage } from '../../utils/usage';

import { formatUsageCurrency } from './currency';
import { makeModifierText } from './editor-display';
import { EXTRA_USAGE_DISABLED_HIDEABLE_STATE } from './extra-usage-disabled';
import { isHidden } from './hideable';
import { formatRawOrLabeledValue } from './raw-or-labeled';
import { USAGE_NO_DATA_HIDEABLE_STATE } from './usage-display';
import {
    LIMIT_SCALE,
    formatColoredValue,
    getValueColorsModifier,
    getValueFormatOptions,
    isValueColorsEnabled
} from './value-coloring';
import {
    VALUE_COLORS_KEYBIND,
    renderValueColorsEditor
} from './value-colors-editor';

const DEFAULT_COLOR = 'green';
// The previews show $106.00 used of a $4,000.00 limit, $3,894.00 left
const PREVIEW_USED_PERCENT = 106 / 4000 * 100;

// How a widget's value colors editor describes it
export interface ExtraUsageValueColorsWording {
    title: string;
    // What the sample's percents are of, e.g. "of the limit"
    sampleNote: string;
}

// The Extra Usage Used and Remaining widgets show one labeled amount of money
// from the usage API. They differ in how the amount is worked out, and their
// label, name, description and preview sample. Value colors, where a widget
// offers them, measure the share of the monthly limit used.
export abstract class ExtraUsageAmountWidget implements Widget {
    abstract getDescription(): string;
    abstract getDisplayName(): string;

    protected abstract readonly label: string;
    // The TUI preview's sample amount, in dollars
    protected abstract readonly previewDollars: number;
    // Set by a widget that offers value colors
    protected readonly valueColors: ExtraUsageValueColorsWording | null = null;
    // The amount in dollars, or null when the usage data doesn't have what it needs
    protected abstract getDollars(data: RenderUsageData): number | null;

    getDefaultColor(): string { return DEFAULT_COLOR; }
    getCategory(): string { return 'Usage'; }
    getLabelPrefix(): string { return this.label; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const valueColors = this.valueColors ? getValueColorsModifier(item) : null;
        return { displayText: this.getDisplayName(), modifierText: makeModifierText(valueColors ? [valueColors] : []) };
    }

    getCustomKeybinds(): CustomKeybind[] {
        return this.valueColors ? [VALUE_COLORS_KEYBIND] : [];
    }

    renderEditor(props: WidgetEditorProps): React.ReactElement | null {
        if (!this.valueColors) {
            return null;
        }
        return renderValueColorsEditor(props, {
            ...this.valueColors,
            scale: LIMIT_SCALE,
            defaultColor: DEFAULT_COLOR,
            maxPercent: 100,
            label: this.label
        });
    }

    // Value colors embed their own foreground codes, so the renderer must
    // leave this widget's foreground alone while they're on
    preservesRenderedColors(item: WidgetItem): boolean {
        return this.valueColors !== null && isValueColorsEnabled(item);
    }

    getHideableStates(): HideableState[] {
        return [EXTRA_USAGE_DISABLED_HIDEABLE_STATE, USAGE_NO_DATA_HIDEABLE_STATE];
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const format = resolveNumberFormat('cost', item, settings);
        if (context.isPreview) {
            return this.formatAmount(item, settings, formatUsageCurrency(this.previewDollars, undefined, format), PREVIEW_USED_PERCENT);
        }

        const data = context.usageData ?? {};
        if (data.extraUsageEnabled === false) {
            return isHidden(item, EXTRA_USAGE_DISABLED_HIDEABLE_STATE.key)
                ? null
                : formatRawOrLabeledValue(item, this.getLabelPrefix(), 'n/a');
        }

        const dollars = data.extraUsageEnabled === true ? this.getDollars(data) : null;
        if (dollars === null) {
            if (data.error) {
                return isHidden(item, USAGE_NO_DATA_HIDEABLE_STATE.key)
                    ? null
                    : getUsageErrorMessage(data.error);
            }
            return null;
        }

        // Without a monthly limit there's nothing to measure the spend against
        const limit = data.extraUsageLimit ?? 0;
        const usedPercent = limit > 0 && data.extraUsageUsed !== undefined ? data.extraUsageUsed / limit * 100 : null;
        return this.formatAmount(item, settings, formatUsageCurrency(dollars, data.extraUsageCurrency, format), usedPercent);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
    supportsNumberFormat(): boolean { return true; }

    private formatAmount(item: WidgetItem, settings: Settings, amount: string, usedPercent: number | null): string {
        if (!this.valueColors) {
            return formatRawOrLabeledValue(item, this.getLabelPrefix(), amount);
        }
        const formatOptions = getValueFormatOptions(settings, item.color ?? DEFAULT_COLOR);
        return formatColoredValue(item, this.getLabelPrefix(), amount, usedPercent, LIMIT_SCALE, formatOptions);
    }
}
