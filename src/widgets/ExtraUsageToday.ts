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
import type { UsageData } from '../utils/usage';
import { getUsageErrorMessage } from '../utils/usage';

import { formatUsageCurrency } from './shared/currency';
import {
    TOGGLE_WEEKDAYS_ACTION,
    countBudgetDaysLeft,
    getWeekdaysKeybind,
    isWeekdaysOnly,
    toggleWeekdaysOnly
} from './shared/daily-budget';
import { makeModifierText } from './shared/editor-display';
import { EXTRA_USAGE_DISABLED_HIDEABLE_STATE } from './shared/extra-usage-disabled';
import { isHidden } from './shared/hideable';
import { formatRawOrLabeledValue } from './shared/raw-or-labeled';
import { USAGE_NO_DATA_HIDEABLE_STATE } from './shared/usage-display';
import {
    formatColoredValue,
    getValueColorsModifier,
    getValueFormatOptions,
    isValueColorsEnabled,
    type ValueColorScale
} from './shared/value-coloring';
import {
    VALUE_COLORS_KEYBIND,
    renderValueColorsEditor,
    type ValueColorsEditorOptions
} from './shared/value-colors-editor';

// Green below 80% of the day's budget, yellow up to all of it, red above it
const BUDGET_SCALE: ValueColorScale = { midFrom: 80, highFrom: 100, highEdge: 'above' };
const DEFAULT_COLOR = 'green';
const LABEL = 'Overage Today: ';
const VALUE_COLORS_EDITOR: ValueColorsEditorOptions = {
    title: 'Extra Usage Today: value colors',
    scale: BUDGET_SCALE,
    sampleNote: 'of today\'s budget',
    defaultColor: DEFAULT_COLOR,
    label: LABEL
};
// The preview's $46.10 against Daily Budget's $194.70 sample
const PREVIEW_PERCENT = 4610 / 19470 * 100;

// Today's spend as a percent of the day's budget: what was left of the monthly
// limit when the day began, spread over the days left (Daily Budget's figure
// shrinks as today's spend grows, so it can't be the baseline). Infinity when
// nothing was left; null without a monthly limit to budget from.
function getBudgetPercent(data: UsageData, spentToday: number, weekdaysOnly: boolean): number | null {
    if (data.extraUsageLimit === undefined || data.extraUsageUsed === undefined) {
        return null;
    }
    const leftAtDayStart = data.extraUsageLimit - (data.extraUsageUsed - spentToday);
    if (leftAtDayStart <= 0) {
        return Infinity;
    }
    // spentToday / (leftAtDayStart / days), multiplied out so exact amounts stay exact
    return spentToday * countBudgetDaysLeft(Date.now(), weekdaysOnly) * 100 / leftAtDayStart;
}

export class ExtraUsageTodayWidget implements Widget {
    getDefaultColor(): string { return DEFAULT_COLOR; }
    getDescription(): string { return 'Shows the extra usage spent today (since 00:00 UTC), including claude.ai and other machines'; }
    getDisplayName(): string { return 'Extra Usage Today'; }
    getCategory(): string { return 'Usage'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const valueColors = getValueColorsModifier(item);
        const modifiers = valueColors ? [valueColors, ...(isWeekdaysOnly(item) ? ['weekdays'] : [])] : [];
        return { displayText: this.getDisplayName(), modifierText: makeModifierText(modifiers) };
    }

    // Weekdays only changes the day's budget, which only value colors use
    getCustomKeybinds(item?: WidgetItem): CustomKeybind[] {
        return item && isValueColorsEnabled(item) ? [VALUE_COLORS_KEYBIND, getWeekdaysKeybind(item)] : [VALUE_COLORS_KEYBIND];
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        return action === TOGGLE_WEEKDAYS_ACTION ? toggleWeekdaysOnly(item) : null;
    }

    renderEditor(props: WidgetEditorProps): React.ReactElement {
        return renderValueColorsEditor(props, VALUE_COLORS_EDITOR);
    }

    // Value colors paint only the value (or the whole text), so the renderer
    // colors the rest with the theme or widget color
    colorsOnlyItsRuns(item: WidgetItem): boolean {
        return isValueColorsEnabled(item);
    }

    getHideableStates(): HideableState[] {
        return [EXTRA_USAGE_DISABLED_HIDEABLE_STATE, USAGE_NO_DATA_HIDEABLE_STATE];
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const format = resolveNumberFormat('cost', item, settings);
        const formatOptions = getValueFormatOptions(settings);
        if (context.isPreview) {
            return formatColoredValue(item, LABEL, formatUsageCurrency(46.1, undefined, format), PREVIEW_PERCENT, BUDGET_SCALE, formatOptions);
        }

        const data = context.usageData ?? {};
        if (data.extraUsageEnabled === false) {
            return isHidden(item, EXTRA_USAGE_DISABLED_HIDEABLE_STATE.key)
                ? null
                : formatRawOrLabeledValue(item, LABEL, 'n/a');
        }
        if (data.extraUsageEnabled !== true || data.extraUsageUsed === undefined) {
            if (data.error) {
                return isHidden(item, USAGE_NO_DATA_HIDEABLE_STATE.key)
                    ? null
                    : getUsageErrorMessage(data.error);
            }
            return null;
        }

        // Missing until a usage fetch has run since the UTC day began.
        if (data.extraUsageUsedToday === undefined) {
            return null;
        }

        // extraUsageUsedToday is in cents
        const formatted = formatUsageCurrency(data.extraUsageUsedToday / 100, data.extraUsageCurrency, format);
        const percent = getBudgetPercent(data, data.extraUsageUsedToday, isWeekdaysOnly(item));
        return formatColoredValue(item, LABEL, formatted, percent, BUDGET_SCALE, formatOptions);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
    supportsNumberFormat(): boolean { return true; }
}
