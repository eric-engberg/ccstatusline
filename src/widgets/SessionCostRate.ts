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

const LABEL = 'Rate: ';
const DEFAULT_COLOR = 'green';
// The Session Cost sample ($2.45) over 30 minutes
const PREVIEW_RATE = 4.9;
const CLOCK_TIME_KEY = 'clockTime';
const TOGGLE_CLOCK_TIME_ACTION = 'toggle-clock-time';
const HOUR_MS = 60 * 60 * 1000;
// Rates over the first seconds swing wildly ($0.50 in 30s is $60/hr), so the
// widget waits for a full minute of the chosen time.
const MIN_DURATION_MS = 60 * 1000;

function isClockTime(item: WidgetItem): boolean {
    return isMetadataFlagEnabled(item, CLOCK_TIME_KEY);
}

export class SessionCostRateWidget implements Widget {
    getDefaultColor(): string { return DEFAULT_COLOR; }
    getDescription(): string { return 'Shows the session cost per hour, over the time Claude spent working or the whole session'; }
    getDisplayName(): string { return 'Session Cost Rate'; }
    getCategory(): string { return 'Session'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const valueColors = getValueColorsModifier(item);
        const time = isClockTime(item) ? 'clock time' : 'active time';
        return { displayText: this.getDisplayName(), modifierText: makeModifierText(valueColors ? [time, valueColors] : [time]) };
    }

    getCustomKeybinds(item?: WidgetItem): CustomKeybind[] {
        const label = item && isClockTime(item) ? '(t)ime: use active time' : '(t)ime: use clock time';
        return [{ key: 't', label, action: TOGGLE_CLOCK_TIME_ACTION }, VALUE_COLORS_KEYBIND];
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        return action === TOGGLE_CLOCK_TIME_ACTION ? toggleMetadataFlag(item, CLOCK_TIME_KEY) : null;
    }

    renderEditor(props: WidgetEditorProps): React.ReactElement {
        return renderValueColorsEditor(props, {
            title: `${this.getDisplayName()}: value colors`,
            scale: COST_RATE_SCALE,
            sampleNote: 'over this session',
            defaultColor: DEFAULT_COLOR,
            label: LABEL
        });
    }

    // Value colors paint only the value (or the whole text), so the renderer
    // colors the rest with the theme or widget color
    colorsOnlyItsRuns(item: WidgetItem): boolean {
        return isValueColorsEnabled(item);
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const format = resolveNumberFormat('cost', item, settings);
        const formatOptions = getValueFormatOptions(settings);
        if (context.isPreview) {
            return formatColoredValue(item, LABEL, `${formatCost(PREVIEW_RATE, format)}/hr`, PREVIEW_RATE, COST_RATE_SCALE, formatOptions);
        }

        const cost = context.data?.cost;
        const totalCost = cost?.total_cost_usd;
        // Active time is how long Claude spent generating (API time); clock time
        // is the whole session, including time spent waiting for the user.
        const durationMs = isClockTime(item) ? cost?.total_duration_ms : cost?.total_api_duration_ms;
        if (totalCost === undefined || durationMs === undefined || durationMs < MIN_DURATION_MS) {
            return null;
        }

        const perHour = totalCost / (durationMs / HOUR_MS);
        return formatColoredValue(item, LABEL, `${formatCost(perHour, format)}/hr`, perHour, COST_RATE_SCALE, formatOptions);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
    supportsNumberFormat(): boolean { return true; }
}
