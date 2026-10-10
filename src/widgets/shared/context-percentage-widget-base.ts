import type React from 'react';

import type { RenderContext } from '../../types/RenderContext';
import type { Settings } from '../../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetEditorProps,
    WidgetItem
} from '../../types/Widget';
import {
    formatPercent,
    resolveNumberFormat
} from '../../utils/number-format';

import {
    getContextInverseModifierText,
    handleContextInverseAction,
    isContextInverse
} from './context-inverse';
import {
    getContextSliderKeybinds,
    getContextSliderModifierText,
    handleContextSliderAction,
    renderContextSlider
} from './context-slider';
import { paintWidgetBar } from './gradient-bar';
import {
    getLevelGlyph,
    isLevelGlyphMode
} from './level-glyph';
import { renderLevelGlyphEditor } from './level-glyph-editor';
import { formatRawOrLabeledValue } from './raw-or-labeled';
import {
    LIMIT_SCALE,
    formatColoredValue,
    getValueColorsModifier,
    getValueFormatOptions,
    isValueColorsEnabled
} from './value-coloring';
import {
    renderValueColorsEditor,
    withValueColorsKeybind
} from './value-colors-editor';

// Context % and Context % (usable) differ only in their name, color, label, preview
// sample and how they measure the used share of the context window
export abstract class ContextPercentageWidgetBase implements Widget {
    abstract getDefaultColor(): string;
    abstract getDescription(): string;
    abstract getDisplayName(): string;

    // Shown before "Used: " or "Left: ", e.g. "Ctx"
    protected abstract readonly labelPrefix: string;
    // The used percentage the TUI preview shows
    protected abstract readonly previewUsedPercent: number;
    // The used percentage, or null without the data to measure it
    protected abstract getUsedPercentage(context: RenderContext): number | null;

    getCategory(): string { return 'Context'; }

    // "Ctx Used: " or "Ctx Left: ", by which way the widget counts; the
    // level glyph always measures what's used
    getLabelPrefix(item: WidgetItem): string {
        return `${this.labelPrefix} ${isContextInverse(item) && !isLevelGlyphMode(item) ? 'Left' : 'Used'}: `;
    }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        // The level glyph always measures what's used, so used/remaining doesn't apply
        const modifiers = [
            isLevelGlyphMode(item) ? undefined : getContextInverseModifierText(item),
            getContextSliderModifierText(item),
            isLevelGlyphMode(item) ? undefined : getValueColorsModifier(item) ?? undefined
        ].filter((m): m is string => m !== undefined);

        return {
            displayText: this.getDisplayName(),
            modifierText: modifiers.length > 0 ? `(${modifiers.map(m => m.replace(/^\(|\)$/g, '')).join(', ')})` : undefined
        };
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        return handleContextSliderAction(action, item) ?? handleContextInverseAction(action, item);
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const usedPercentage = context.isPreview ? this.previewUsedPercent : this.getUsedPercentage(context);
        if (usedPercentage === null) {
            return null;
        }
        if (isLevelGlyphMode(item)) {
            return formatRawOrLabeledValue(item, this.getLabelPrefix(item), getLevelGlyph(item, usedPercentage));
        }

        const isInverse = isContextInverse(item);

        const displayPercentage = isInverse ? 100 - usedPercentage : usedPercentage;
        const format = resolveNumberFormat('percent', item, settings);
        const slider = renderContextSlider(item, displayPercentage, format, context.barCells);
        const shown = slider === null ? formatPercent(displayPercentage, format) : paintWidgetBar(slider, item, settings, isInverse);
        // Value colors follow the used percent, even while the widget shows
        // what's left, and give a slider, and the percent after it, its level's color
        const formatOptions = getValueFormatOptions(settings);
        return formatColoredValue(item, this.getLabelPrefix(item), shown, usedPercentage, LIMIT_SCALE, formatOptions);
    }

    getCustomKeybinds(item?: WidgetItem): CustomKeybind[] {
        if (item && isLevelGlyphMode(item)) {
            return getContextSliderKeybinds(item);
        }
        return withValueColorsKeybind([
            { key: 'u', label: '(u)sed/remaining', action: 'toggle-inverse' },
            ...getContextSliderKeybinds(item)
        ], item === undefined || !isLevelGlyphMode(item));
    }

    // The level glyph mode's glyph and break point editors, or value colors,
    // whose sample shows what's left while the widget does
    renderEditor(props: WidgetEditorProps): React.ReactElement | null {
        const showsRemaining = isContextInverse(props.widget);
        return renderLevelGlyphEditor(props) ?? renderValueColorsEditor(props, {
            title: `${this.getDisplayName()}: value colors`,
            scale: LIMIT_SCALE,
            sampleNote: showsRemaining ? 'left' : 'used',
            defaultColor: this.getDefaultColor(),
            maxPercent: 100,
            label: this.getLabelPrefix(props.widget),
            showsRemaining
        });
    }

    // Value colors paint only the value or slider (or the whole text), so the
    // renderer colors the rest with the theme or widget color
    colorsOnlyItsRuns(item: WidgetItem): boolean {
        return isValueColorsEnabled(item) && !isLevelGlyphMode(item);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
    supportsNumberFormat(): boolean { return true; }
}
