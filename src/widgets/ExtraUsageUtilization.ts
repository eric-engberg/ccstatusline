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
import {
    LIMIT_SCALE,
    formatColoredValue,
    getValueColorsModifier,
    getValueFormatOptions,
    isValueColorsEnabled
} from './shared/value-coloring';
import {
    renderValueColorsEditor,
    withValueColorsKeybind,
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

// Value colors apply to the percent and to a bar; the level glyph has no
// number to color
function showsValueColors(item: WidgetItem): boolean {
    return isValueColorsEnabled(item) && !isLevelGlyphMode(item);
}

// The bar, the level glyph, or the percent in its value color. The glyph and
// value colors follow the used percent, even while the widget shows what's left.
function formatUsedPercent(item: WidgetItem, label: string, usedPercent: number, settings: Settings, context: RenderContext): string {
    if (isLevelGlyphMode(item)) {
        return formatRawOrLabeledValue(item, label, getLevelGlyph(item, usedPercent));
    }
    const format = resolveNumberFormat('percent', item, settings);
    const renderedPercent = isUsageInverted(item) ? 100 - usedPercent : usedPercent;

    // Value colors give a bar, and the percent after it, its level's color
    const bar = formatUsageBar(item, renderedPercent, format, settings, context);
    const formatOptions = getValueFormatOptions(settings);
    return formatColoredValue(item, label, bar ?? formatPercent(renderedPercent, format), usedPercent, LIMIT_SCALE, formatOptions);
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
                includeGlyph: true,
                showUsageDirection: true,
                extraModifiers: [getValueColorsModifier(item)].filter((modifier): modifier is string => modifier !== null)
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
            return cycleUsageDisplayMode(item, [], true, true, true);
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
        return formatUsedPercent(item, this.getLabelPrefix(), Math.max(0, Math.min(100, utilization)), settings, context);
    }

    getCustomKeybinds(item?: WidgetItem): CustomKeybind[] {
        const keybinds = getUsagePercentCustomKeybinds(item, false);
        return withValueColorsKeybind(keybinds, item === undefined || !isLevelGlyphMode(item));
    }

    // The level glyph's glyph and break point editors, or the value colors
    // editor, whose sample shows what's left while the widget does
    renderEditor(props: WidgetEditorProps): React.ReactElement {
        const showsRemaining = isUsageInverted(props.widget);
        return renderLevelGlyphEditor(props) ?? renderValueColorsEditor(props, { ...VALUE_COLORS_EDITOR, showsRemaining, sampleNote: showsRemaining ? 'left' : 'used' });
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
