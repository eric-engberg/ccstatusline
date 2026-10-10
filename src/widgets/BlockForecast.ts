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
    formatPercent,
    resolveNumberFormat
} from '../utils/number-format';

import {
    getUsageDirectionKeybind,
    getUsageDisplayModifierText,
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
    withValueColorsKeybind
} from './shared/value-colors-editor';

const LABEL = '→';
const DEFAULT_COLOR = 'brightBlue';
// On pace for the limit, so the preview reads with Block Limit Timer's
const PREVIEW_PROJECTED_PERCENT = 100;

export class BlockForecastWidget implements Widget {
    getDefaultColor(): string { return DEFAULT_COLOR; }
    getDescription(): string { return 'Projected usage of the 5-hour block at its reset, from the recent pace; hidden until there\'s a forecast'; }
    getDisplayName(): string { return 'Block Forecast'; }
    getCategory(): string { return 'Usage'; }
    getLabelPrefix(): string { return LABEL; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return {
            displayText: this.getDisplayName(),
            modifierText: getUsageDisplayModifierText(item, {
                showUsageDirection: true,
                extraModifiers: [getValueColorsModifier(item)].filter((modifier): modifier is string => modifier !== null)
            })
        };
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        return action === 'toggle-invert' ? toggleUsageInverted(item) : null;
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const format = resolveNumberFormat('percent', item, settings);
        const inverted = isUsageInverted(item);
        const shown = (usedPercent: number): string => formatPercent(inverted ? 100 - usedPercent : usedPercent, format);
        // Value colors follow the projected used percent, even while the widget
        // shows what would be left
        const formatOptions = getValueFormatOptions(settings);

        if (context.isPreview) {
            return formatColoredValue(item, LABEL, shown(PREVIEW_PROJECTED_PERCENT), PREVIEW_PROJECTED_PERCENT, LIMIT_SCALE, formatOptions);
        }

        const forecast = context.sessionForecast;
        const currentPercent = context.usageData?.sessionUsage;
        if (!forecast || currentPercent === undefined) {
            return null;
        }

        // Nothing to add when the projection would only repeat the current value.
        const projected = shown(forecast.projectedPercent);
        if (projected === shown(Math.max(0, Math.min(100, currentPercent)))) {
            return null;
        }

        return formatColoredValue(item, LABEL, projected, forecast.projectedPercent, LIMIT_SCALE, formatOptions);
    }

    getCustomKeybinds(item?: WidgetItem): CustomKeybind[] {
        return withValueColorsKeybind([getUsageDirectionKeybind(item)], true);
    }

    // The value colors editor, whose sample shows what's left while the widget does
    renderEditor(props: WidgetEditorProps): React.ReactElement {
        const showsRemaining = isUsageInverted(props.widget);
        return renderValueColorsEditor(props, {
            title: `${this.getDisplayName()}: value colors`,
            scale: LIMIT_SCALE,
            sampleNote: showsRemaining ? 'left' : 'used',
            defaultColor: DEFAULT_COLOR,
            maxPercent: 100,
            label: LABEL,
            showsRemaining
        });
    }

    // Value colors paint only the value (or the whole text), so the renderer
    // colors the rest with the theme or widget color
    colorsOnlyItsRuns(item: WidgetItem): boolean {
        return isValueColorsEnabled(item);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
    supportsNumberFormat(): boolean { return true; }
}
