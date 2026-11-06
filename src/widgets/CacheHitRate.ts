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
    formatPercent,
    resolveNumberFormat
} from '../utils/number-format';

import {
    getCacheHitRate,
    getCacheTokens
} from './shared/cache-metrics';
import {
    CACHE_EMPTY_HIDEABLE_STATE,
    getCacheKeybinds,
    handleCacheOptionsAction,
    isCacheSessionScope
} from './shared/cache-scope';
import { makeModifierText } from './shared/editor-display';
import { isHidden } from './shared/hideable';
import { formatRawOrLabeledValue } from './shared/raw-or-labeled';
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

const DEFAULT_COLOR = 'green';
// A higher hit rate is the good one: red below 50%, yellow below 80%, green from 80%
const HIT_RATE_SCALE: ValueColorScale = { midFrom: 50, highFrom: 80, highEdge: 'from', higherIsBetter: true };
const LABEL = 'Cache Hit: ';
const VALUE_COLORS_EDITOR: ValueColorsEditorOptions = {
    title: 'Cache Hit Rate: value colors',
    scale: HIT_RATE_SCALE,
    sampleNote: 'hit',
    defaultColor: DEFAULT_COLOR,
    maxPercent: 100,
    label: LABEL
};

export class CacheHitRateWidget implements Widget {
    getDefaultColor(): string { return DEFAULT_COLOR; }
    getDescription(): string { return 'Shows prompt cache hit rate (cache reads vs cache writes)'; }
    getDisplayName(): string { return 'Cache Hit Rate'; }
    getCategory(): string { return 'Cache'; }
    getLabelPrefix(): string { return LABEL; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const modifiers = [isCacheSessionScope(item) ? 'session' : null, getValueColorsModifier(item)].filter((modifier): modifier is string => modifier !== null);
        return { displayText: this.getDisplayName(), modifierText: makeModifierText(modifiers) };
    }

    getHideableStates(): HideableState[] {
        return [CACHE_EMPTY_HIDEABLE_STATE];
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        return handleCacheOptionsAction(action, item);
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const format = resolveNumberFormat('percent', item, settings);
        const formatOptions = getValueFormatOptions(settings);
        if (context.isPreview) {
            return formatColoredValue(item, this.getLabelPrefix(), formatPercent(87, format), 87, HIT_RATE_SCALE, formatOptions);
        }

        const hideWhenEmpty = isHidden(item, CACHE_EMPTY_HIDEABLE_STATE.key);
        const tokens = getCacheTokens(context, isCacheSessionScope(item));
        if (!tokens) {
            return hideWhenEmpty ? null : formatRawOrLabeledValue(item, this.getLabelPrefix(), 'n/a');
        }

        const hitRate = getCacheHitRate(tokens);
        if (hitRate === null) {
            return hideWhenEmpty ? null : formatRawOrLabeledValue(item, this.getLabelPrefix(), formatPercent(0, format));
        }

        if (hitRate === 0 && hideWhenEmpty) {
            return null;
        }

        return formatColoredValue(item, this.getLabelPrefix(), formatPercent(hitRate, format), hitRate, HIT_RATE_SCALE, formatOptions);
    }

    getCustomKeybinds(item?: WidgetItem): CustomKeybind[] {
        return [...getCacheKeybinds(), VALUE_COLORS_KEYBIND];
    }

    renderEditor(props: WidgetEditorProps): React.ReactElement {
        return renderValueColorsEditor(props, VALUE_COLORS_EDITOR);
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
