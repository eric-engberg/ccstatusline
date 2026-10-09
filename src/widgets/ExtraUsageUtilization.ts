import type React from 'react';

import type {
    RenderContext,
    RenderUsageData
} from '../types/RenderContext';
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
import {
    getLevelGlyph,
    isLevelGlyphMode
} from './shared/level-glyph';
import { renderLevelGlyphEditor } from './shared/level-glyph-editor';
import { formatRawOrLabeledValue } from './shared/raw-or-labeled';
import {
    USAGE_NO_DATA_HIDEABLE_STATE,
    cycleUsageDisplayMode,
    formatUsageBar,
    getUsageDisplayModifierText,
    getUsagePercentCustomKeybinds,
    isUsageInverted,
    toggleUsageInverted
} from './shared/usage-display';

// The usage API reports `utilization: null` until the first charge of the month,
// while still reporting the amount spent and the monthly limit (both in cents).
function getExtraUsageUtilization(data: RenderUsageData): number | undefined {
    if (data.extraUsageUtilization !== undefined) {
        return data.extraUsageUtilization;
    }
    if (data.extraUsageUsed === undefined || data.extraUsageLimit === undefined || data.extraUsageLimit <= 0) {
        return undefined;
    }
    return data.extraUsageUsed / data.extraUsageLimit * 100;
}
const LABEL = 'Overage: ';

// The bar, the level glyph or the percent. The glyph measures what's used,
// even while the widget shows what's left.
function formatUsedPercent(item: WidgetItem, usedPercent: number, settings: Settings, context: RenderContext): string {
    if (isLevelGlyphMode(item)) {
        return formatRawOrLabeledValue(item, LABEL, getLevelGlyph(item, usedPercent));
    }
    const format = resolveNumberFormat('percent', item, settings);
    const renderedPercent = isUsageInverted(item) ? 100 - usedPercent : usedPercent;
    const bar = formatUsageBar(item, renderedPercent, format, settings, context);
    return formatRawOrLabeledValue(item, LABEL, bar ?? formatPercent(renderedPercent, format));
}

export class ExtraUsageUtilizationWidget implements Widget {
    getDefaultColor(): string { return 'green'; }
    getDescription(): string { return 'Shows extra usage as a percentage of your monthly limit (Pro/Max overage or Enterprise spend)'; }
    getDisplayName(): string { return 'Extra Usage Utilization'; }
    getCategory(): string { return 'Usage'; }
    getLabelPrefix(): string { return LABEL; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return {
            displayText: this.getDisplayName(),
            modifierText: getUsageDisplayModifierText(item, { includeGlyph: true, showUsageDirection: true })
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
            return cycleUsageDisplayMode(item, [], true, true, true);
        }

        if (action === 'toggle-invert') {
            return toggleUsageInverted(item);
        }

        return null;
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview) {
            return formatUsedPercent(item, 85, settings, context);
        }

        const data = context.usageData ?? {};
        if (data.extraUsageEnabled === false) {
            return isHidden(item, EXTRA_USAGE_DISABLED_HIDEABLE_STATE.key)
                ? null
                : formatRawOrLabeledValue(item, LABEL, 'n/a');
        }
        const utilization = getExtraUsageUtilization(data);
        if (data.extraUsageEnabled !== true || utilization === undefined) {
            if (data.error) {
                return isHidden(item, USAGE_NO_DATA_HIDEABLE_STATE.key)
                    ? null
                    : getUsageErrorMessage(data.error);
            }
            return null;
        }

        // utilization is a percentage (0-100), not a fraction
        return formatUsedPercent(item, Math.max(0, Math.min(100, utilization)), settings, context);
    }

    getCustomKeybinds(item?: WidgetItem): CustomKeybind[] {
        return getUsagePercentCustomKeybinds(item, false);
    }

    // The level glyph mode's glyph and break point editors
    renderEditor(props: WidgetEditorProps): React.ReactElement | null {
        return renderLevelGlyphEditor(props);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
    supportsNumberFormat(): boolean { return true; }
}
