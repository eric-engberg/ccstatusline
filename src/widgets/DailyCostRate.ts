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
import {
    formatCost,
    resolveNumberFormat
} from '../utils/number-format';

import { makeModifierText } from './shared/editor-display';
import {
    isMetadataFlagEnabled,
    toggleMetadataFlag
} from './shared/metadata';
import {
    COST_RATE_SCALE,
    formatColoredValue,
    getValueColorsModifier,
    getValueFormatOptions,
    isValueColorsEnabled
} from './shared/value-coloring';
import {
    VALUE_COLORS_KEYBIND,
    renderValueColorsEditor
} from './shared/value-colors-editor';

const LABEL = 'Rate Today: ';
const DEFAULT_COLOR = 'green';
const PREVIEW_RATE = 6.2;
const CLOCK_TIME_KEY = 'clockTime';
const BILLED_SPEND_KEY = 'billedSpend';
const TOGGLE_CLOCK_TIME_ACTION = 'toggle-clock-time';
const TOGGLE_BILLED_SPEND_ACTION = 'toggle-billed-spend';
const HOUR_MS = 60 * 60 * 1000;
// Rates over the first seconds swing wildly, so the widget waits for a full
// minute of the chosen time.
const MIN_DURATION_MS = 60 * 1000;

function isClockTime(item: WidgetItem): boolean {
    return isMetadataFlagEnabled(item, CLOCK_TIME_KEY);
}

function isBilledSpend(item: WidgetItem): boolean {
    return isMetadataFlagEnabled(item, BILLED_SPEND_KEY);
}

// Billed spend covers claude.ai and other machines too; the hours only ever
// come from this machine's Claude Code sessions. Billed spend is unknown until
// a usage fetch has run since the UTC day began.
function getTodaysCost(item: WidgetItem, context: RenderContext, claudeCodeCost: number): number | undefined {
    if (!isBilledSpend(item)) {
        return claudeCodeCost;
    }

    const billedCents = context.usageData?.extraUsageUsedToday;
    return billedCents === undefined ? undefined : billedCents / 100;
}

export class DailyCostRateWidget implements Widget {
    getDefaultColor(): string { return DEFAULT_COLOR; }
    getDescription(): string { return 'Shows today\'s cost per hour across all of today\'s Claude Code sessions, from Claude Code\'s costs or billed spend'; }
    getDisplayName(): string { return 'Daily Cost Rate'; }
    getCategory(): string { return 'Session'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const time = isClockTime(item) ? 'clock time' : 'active time';
        const cost = isBilledSpend(item) ? 'billed spend' : 'Claude Code cost';
        const valueColors = getValueColorsModifier(item);
        return { displayText: this.getDisplayName(), modifierText: makeModifierText(valueColors ? [time, cost, valueColors] : [time, cost]) };
    }

    getCustomKeybinds(item?: WidgetItem): CustomKeybind[] {
        const timeLabel = item && isClockTime(item) ? '(t)ime: use active time' : '(t)ime: use clock time';
        const costLabel = item && isBilledSpend(item) ? '(b) Claude Code cost' : '(b)illed spend';
        return [
            { key: 't', label: timeLabel, action: TOGGLE_CLOCK_TIME_ACTION },
            { key: 'b', label: costLabel, action: TOGGLE_BILLED_SPEND_ACTION },
            VALUE_COLORS_KEYBIND
        ];
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action === TOGGLE_CLOCK_TIME_ACTION) {
            return toggleMetadataFlag(item, CLOCK_TIME_KEY);
        }
        if (action === TOGGLE_BILLED_SPEND_ACTION) {
            return toggleMetadataFlag(item, BILLED_SPEND_KEY);
        }
        return null;
    }

    renderEditor(props: WidgetEditorProps): React.ReactElement {
        return renderValueColorsEditor(props, {
            title: `${this.getDisplayName()}: value colors`,
            scale: COST_RATE_SCALE,
            sampleNote: 'over today',
            defaultColor: DEFAULT_COLOR,
            label: LABEL
        });
    }

    // Value colors embed their own foreground codes, so the renderer must
    // leave this widget's foreground alone while they're on
    preservesRenderedColors(item: WidgetItem): boolean {
        return isValueColorsEnabled(item);
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const format = resolveNumberFormat('cost', item, settings);
        const formatOptions = getValueFormatOptions(settings);
        if (context.isPreview) {
            return formatColoredValue(item, LABEL, `${formatCost(PREVIEW_RATE, format)}/hr`, PREVIEW_RATE, COST_RATE_SCALE, formatOptions);
        }

        const totals = context.dailyCost;
        if (!totals) {
            return null;
        }

        const cost = getTodaysCost(item, context, totals.claudeCodeCost);
        const durationMs = isClockTime(item) ? totals.clockMs : totals.activeMs;
        if (cost === undefined || durationMs < MIN_DURATION_MS) {
            return null;
        }

        const perHour = cost / (durationMs / HOUR_MS);
        return formatColoredValue(item, LABEL, `${formatCost(perHour, format)}/hr`, perHour, COST_RATE_SCALE, formatOptions);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
    supportsNumberFormat(): boolean { return true; }
}
