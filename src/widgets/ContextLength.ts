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
import { calculateContextPercentageMetrics } from '../utils/context-percentage';
import { getContextWindowContextLengthTokens } from '../utils/context-window';
import { resolveNumberFormat } from '../utils/number-format';
import { formatTokens } from '../utils/renderer';

import { makeModifierText } from './shared/editor-display';
import {
    LIMIT_SCALE,
    formatColoredValue,
    getValueColorsModifier,
    getValueFormatOptions,
    isValueColorsEnabled
} from './shared/value-coloring';
import {
    VALUE_COLORS_KEYBIND,
    renderValueColorsEditor,
    type ValueColorsEditorOptions
} from './shared/value-colors-editor';

const LABEL = 'Ctx: ';
const DEFAULT_COLOR = 'brightBlack';
const VALUE_COLORS_EDITOR: ValueColorsEditorOptions = {
    title: 'Context Length: value colors',
    scale: LIMIT_SCALE,
    sampleNote: 'of the context window',
    defaultColor: DEFAULT_COLOR,
    maxPercent: 100,
    label: LABEL
};
const PREVIEW_TOKENS = 18600;
// The preview's tokens in a 200k context window
const PREVIEW_PERCENT = PREVIEW_TOKENS / 200000 * 100;

export class ContextLengthWidget implements Widget {
    getDefaultColor(): string { return DEFAULT_COLOR; }
    getDescription(): string { return 'Shows the current context window size in tokens'; }
    getDisplayName(): string { return 'Context Length'; }
    getCategory(): string { return 'Context'; }
    getLabelPrefix(): string { return LABEL; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const valueColors = getValueColorsModifier(item);
        return { displayText: this.getDisplayName(), modifierText: makeModifierText(valueColors ? [valueColors] : []) };
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [VALUE_COLORS_KEYBIND];
    }

    renderEditor(props: WidgetEditorProps): React.ReactElement {
        return renderValueColorsEditor(props, VALUE_COLORS_EDITOR);
    }

    // Value colors embed their own foreground codes, so the renderer must
    // leave this widget's foreground alone while they're on
    preservesRenderedColors(item: WidgetItem): boolean {
        return isValueColorsEnabled(item);
    }

    // Value colors measure the length against the context window, as Context % does
    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const format = resolveNumberFormat('token', item, settings);
        const formatOptions = getValueFormatOptions(settings, item.color ?? DEFAULT_COLOR);
        if (context.isPreview) {
            return formatColoredValue(item, this.getLabelPrefix(), formatTokens(PREVIEW_TOKENS, format), PREVIEW_PERCENT, LIMIT_SCALE, formatOptions);
        }

        const contextLengthTokens = getContextWindowContextLengthTokens(context.data) ?? context.tokenMetrics?.contextLength ?? null;
        if (contextLengthTokens === null) {
            return null;
        }

        const usedPercent = calculateContextPercentageMetrics(context)?.usedPercentage ?? null;
        return formatColoredValue(item, this.getLabelPrefix(), formatTokens(contextLengthTokens, format), usedPercent, LIMIT_SCALE, formatOptions);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
    supportsNumberFormat(): boolean { return true; }
}
