import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    HideableState,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { resolveNumberFormat } from '../utils/number-format';
import { getUsageErrorMessage } from '../utils/usage';

import { formatUsageCurrency } from './shared/currency';
import { EXTRA_USAGE_DISABLED_HIDEABLE_STATE } from './shared/extra-usage-disabled';
import { getExtraUsageLabel } from './shared/extra-usage-label';
import { isHidden } from './shared/hideable';
import { formatRawOrLabeledValue } from './shared/raw-or-labeled';
import { USAGE_NO_DATA_HIDEABLE_STATE } from './shared/usage-display';

export class ExtraUsageTodayWidget implements Widget {
    getDefaultColor(): string { return 'green'; }
    getDescription(): string { return 'Shows the extra usage spent today (since 00:00 UTC), including claude.ai and other machines'; }
    getDisplayName(): string { return 'Extra Usage Today'; }
    getCategory(): string { return 'Usage'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    getHideableStates(): HideableState[] {
        return [EXTRA_USAGE_DISABLED_HIDEABLE_STATE, USAGE_NO_DATA_HIDEABLE_STATE];
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const label = `${getExtraUsageLabel(context.usageData)} Today: `;
        const format = resolveNumberFormat('cost', item, settings);
        if (context.isPreview) {
            return formatRawOrLabeledValue(item, label, formatUsageCurrency(46.1, undefined, format));
        }

        const data = context.usageData ?? {};
        if (data.extraUsageEnabled === false) {
            return isHidden(item, EXTRA_USAGE_DISABLED_HIDEABLE_STATE.key)
                ? null
                : formatRawOrLabeledValue(item, label, 'n/a');
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
        return formatRawOrLabeledValue(item, label, formatted);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
    supportsNumberFormat(): boolean { return true; }
}
