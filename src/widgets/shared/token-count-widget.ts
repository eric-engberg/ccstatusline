import type React from 'react';

import type { RenderContext } from '../../types/RenderContext';
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
import { formatTokens } from '../../utils/renderer';

import { makeModifierText } from './editor-display';
import { isHidden } from './hideable';
import {
    formatColoredValue,
    getValueColorsModifier,
    getValueFormatOptions,
    isValueColorsEnabled,
    type ValueColorScale
} from './value-coloring';
import {
    VALUE_COLORS_KEYBIND,
    renderValueColorsEditor
} from './value-colors-editor';
import { makeTokenUnit } from './value-units';

const ZERO_HIDEABLE_STATE: HideableState = { key: 'zero', label: 'when token count is zero' };

/** Value colors in tokens, stepping by step; the gradient ends at the high break point. */
export function makeTokenScale(midFrom: number, highFrom: number, step: number): ValueColorScale {
    return { midFrom, highFrom, highEdge: 'from', unit: makeTokenUnit(step), gradientEnd: highFrom };
}

// The Tokens Input, Output, Cached and Total widgets show one labeled token
// count for the session. They differ in where the count comes from, and their
// label, name, color, preview sample and value colors' break points.
export abstract class TokenCountWidget implements Widget {
    abstract getDefaultColor(): string;
    abstract getDescription(): string;
    abstract getDisplayName(): string;

    protected abstract readonly label: string;
    // The TUI preview's sample count
    protected abstract readonly previewTokens: number;
    // Each count runs to a different size over a session: a few thousand
    // uncached input tokens, but hundreds of millions cached
    protected abstract readonly valueColorScale: ValueColorScale;
    // The session's count, or null when there's no data for it
    protected abstract getTokenCount(context: RenderContext): number | null;

    getCategory(): string { return 'Tokens'; }
    getLabelPrefix(): string { return this.label; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const valueColors = getValueColorsModifier(item);
        return { displayText: this.getDisplayName(), modifierText: makeModifierText(valueColors ? [valueColors] : []) };
    }

    getHideableStates(): HideableState[] {
        return [ZERO_HIDEABLE_STATE];
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [VALUE_COLORS_KEYBIND];
    }

    renderEditor(props: WidgetEditorProps): React.ReactElement {
        return renderValueColorsEditor(props, {
            title: `${this.getDisplayName()}: value colors`,
            scale: this.valueColorScale,
            sampleNote: 'this session',
            defaultColor: this.getDefaultColor(),
            label: this.getLabelPrefix()
        });
    }

    // Value colors embed their own foreground codes, so the renderer must
    // leave this widget's foreground alone while they're on
    preservesRenderedColors(item: WidgetItem): boolean {
        return isValueColorsEnabled(item);
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const format = resolveNumberFormat('token', item, settings);
        const formatOptions = getValueFormatOptions(settings);
        if (context.isPreview) {
            return formatColoredValue(item, this.getLabelPrefix(), formatTokens(this.previewTokens, format), this.previewTokens, this.valueColorScale, formatOptions);
        }

        const tokens = this.getTokenCount(context);
        if (tokens === null) {
            return null;
        }

        if (tokens === 0 && isHidden(item, ZERO_HIDEABLE_STATE.key)) {
            return null;
        }

        return formatColoredValue(item, this.getLabelPrefix(), formatTokens(tokens, format), tokens, this.valueColorScale, formatOptions);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
    supportsNumberFormat(): boolean { return true; }
}
