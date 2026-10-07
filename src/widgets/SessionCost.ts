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
import {
    formatCost,
    resolveNumberFormat
} from '../utils/number-format';

import { makeModifierText } from './shared/editor-display';
import { isHidden } from './shared/hideable';
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
import { DOLLAR_UNIT } from './shared/value-units';

const LABEL = 'Cost: ';
const DEFAULT_COLOR = 'green';
const PREVIEW_COST = 2.45;
const ZERO_HIDEABLE_STATE: HideableState = { key: 'zero', label: 'when cost is $0.00' };
// Green below $5, yellow below $20, red from $20
const COST_SCALE: ValueColorScale = { midFrom: 5, highFrom: 20, highEdge: 'from', unit: DOLLAR_UNIT, gradientEnd: 20 };
const VALUE_COLORS_EDITOR: ValueColorsEditorOptions = {
    title: 'Session Cost: value colors',
    scale: COST_SCALE,
    sampleNote: 'this session',
    defaultColor: DEFAULT_COLOR,
    label: LABEL
};

export class SessionCostWidget implements Widget {
    getDefaultColor(): string { return DEFAULT_COLOR; }
    getDescription(): string { return 'Shows the total session cost in USD'; }
    getDisplayName(): string { return 'Session Cost'; }
    getCategory(): string { return 'Session'; }
    getLabelPrefix(): string { return LABEL; }
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
        return renderValueColorsEditor(props, VALUE_COLORS_EDITOR);
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
            return formatColoredValue(item, this.getLabelPrefix(), formatCost(PREVIEW_COST, format), PREVIEW_COST, COST_SCALE, formatOptions);
        }

        const totalCost = context.data?.cost?.total_cost_usd;
        if (totalCost === undefined) {
            return null;
        }

        // Keep the zero-state threshold tied to the baseline cent precision,
        // independent of the selected display style or decimal override.
        const roundsToZeroCents = totalCost >= 0 && totalCost < 0.005;
        if (roundsToZeroCents && isHidden(item, ZERO_HIDEABLE_STATE.key)) {
            return null;
        }

        return formatColoredValue(item, this.getLabelPrefix(), formatCost(totalCost, format), totalCost, COST_SCALE, formatOptions);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
    supportsNumberFormat(): boolean { return true; }
}
