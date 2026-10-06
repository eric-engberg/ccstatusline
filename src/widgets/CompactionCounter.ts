import type { NumberFormat } from '../types/NumberFormat';
import type {
    CompactionData,
    RenderContext
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
import { ZERO_COMPACTION_STATS } from '../utils/compaction';
import { formatTokens } from '../utils/format-tokens';
import { resolveNumberFormat } from '../utils/number-format';

import { isHidden } from './shared/hideable';
import {
    isMetadataFlagEnabled,
    isNerdFontEnabled,
    setNerdFontFormat,
    toggleMetadataFlag,
    toggleNerdFont,
    type NerdFontFormats
} from './shared/metadata';
import {
    getSlotSymbol,
    getSymbolKeybind,
    renderSymbolSlotsEditor,
    type SymbolSlot
} from './shared/symbol-override';
import {
    formatColoredValue,
    getValueColorsModifier,
    getValueFormatOptions,
    isValueColorsEnabled,
    type ValueColorScale,
    type ValueFormatOptions
} from './shared/value-coloring';
import {
    EDIT_VALUE_COLORS_ACTION,
    renderValueColorsEditor
} from './shared/value-colors-editor';
import { COUNT_UNIT } from './shared/value-units';

const DEFAULT_COLOR = 'yellow';
const COMPACTION_ICON = '↻';
const COMPACTION_NERD_FONT_ICON = '\uF021';
const FORMATS = ['icon-space-number', 'text-and-number', 'number'] as const;
type CompactionCounterFormat = typeof FORMATS[number];

const DEFAULT_FORMAT: CompactionCounterFormat = 'icon-space-number';
const CYCLE_FORMAT_ACTION = 'cycle-format';
const TOGGLE_NERD_FONT_ACTION = 'toggle-nerd-font';
const TOGGLE_TRIGGERS_ACTION = 'toggle-triggers';
const SHOW_TRIGGERS_METADATA_KEY = 'showTriggers';
const TOGGLE_RECLAIMED_ACTION = 'toggle-reclaimed';
const SHOW_RECLAIMED_METADATA_KEY = 'showReclaimed';
// Selectable metric. The default 'count' keeps the full composite display
// (icon, count, optional trigger split, optional reclaimed). The other metrics
// render just that one value as a raw number, so several instances can be
// composed with custom separators/symbols into a layout like "2 · 1a 1m · ↓2M".
const METRICS = ['count', 'auto', 'manual', 'unknown', 'reclaimed'] as const;
type CompactionMetric = typeof METRICS[number];
const DEFAULT_METRIC: CompactionMetric = 'count';
const METRIC_METADATA_KEY = 'metric';
const CYCLE_METRIC_ACTION = 'cycle-metric';
const RECLAIMED_SLOT: SymbolSlot = { id: 'symbolReclaimed', label: 'Reclaimed', defaultSymbol: '↓' };
const ZERO_HIDEABLE_STATE: HideableState = { key: 'zero', label: 'when count is zero' };
// Green with no compactions, yellow from the first, red from the third
const COUNT_SCALE: ValueColorScale = { midFrom: 1, highFrom: 3, highEdge: 'from', unit: COUNT_UNIT, gradientEnd: 3 };
// (v) already cycles the value shown
const VALUE_COLORS_KEYBIND: CustomKeybind = { key: 'l', label: 'va(l)ue colors', action: EDIT_VALUE_COLORS_ACTION };
const SAMPLE_STATS: CompactionData = Object.freeze({
    count: 2,
    byTrigger: Object.freeze({ auto: 1, manual: 1, unknown: 0 }),
    tokensReclaimed: 120000
});

function getFormat(item: WidgetItem): CompactionCounterFormat {
    const format = item.metadata?.format;
    return (FORMATS as readonly string[]).includes(format ?? '') ? (format as CompactionCounterFormat) : DEFAULT_FORMAT;
}

// Only the icon format draws a glyph; the other two are text.
function canUseNerdFont(item: WidgetItem): boolean {
    return getFormat(item) === DEFAULT_FORMAT;
}

const NERD_FONT_FORMATS: NerdFontFormats<CompactionCounterFormat> = {
    defaultFormat: DEFAULT_FORMAT,
    canUseNerdFont
};

function getMetric(item: WidgetItem): CompactionMetric {
    const metric = item.metadata?.[METRIC_METADATA_KEY];
    return (METRICS as readonly string[]).includes(metric ?? '') ? (metric as CompactionMetric) : DEFAULT_METRIC;
}

function setMetric(item: WidgetItem, metric: CompactionMetric): WidgetItem {
    if (metric === DEFAULT_METRIC) {
        const { [METRIC_METADATA_KEY]: removedMetric, ...restMetadata } = item.metadata ?? {};

        return {
            ...item,
            metadata: Object.keys(restMetadata).length > 0 ? restMetadata : undefined
        };
    }

    return {
        ...item,
        metadata: {
            ...(item.metadata ?? {}),
            [METRIC_METADATA_KEY]: metric
        }
    };
}

// Value colors color a count; tokens reclaimed aren't one
function hasValueColors(item: WidgetItem): boolean {
    return getMetric(item) !== 'reclaimed';
}

function getMetricValue(data: CompactionData, metric: CompactionMetric): number {
    switch (metric) {
        case 'count': return data.count;
        case 'auto': return data.byTrigger.auto;
        case 'manual': return data.byTrigger.manual;
        case 'unknown': return data.byTrigger.unknown;
        case 'reclaimed': return data.tokensReclaimed;
    }
}

function formatReclaimedSuffix(tokensReclaimed: number, item: WidgetItem, format: NumberFormat): string {
    if (tokensReclaimed <= 0) {
        return '';
    }
    const symbol = getSlotSymbol(item, RECLAIMED_SLOT);
    return symbol.length > 0 ? ` ${symbol}${formatTokens(tokensReclaimed, format)}` : ` ${formatTokens(tokensReclaimed, format)}`;
}

function formatTriggerSuffix(byTrigger: CompactionData['byTrigger']): string {
    const parts: string[] = [];
    if (byTrigger.auto > 0) {
        parts.push(`${byTrigger.auto} auto`);
    }
    if (byTrigger.manual > 0) {
        parts.push(`${byTrigger.manual} manual`);
    }
    if (byTrigger.unknown > 0) {
        parts.push(`${byTrigger.unknown} unknown`);
    }
    return parts.length > 0 ? ` (${parts.join(', ')})` : '';
}

function formatStats(data: CompactionData, item: WidgetItem, icon: string, format: NumberFormat, formatOptions: ValueFormatOptions): string {
    let suffix = '';
    if (isMetadataFlagEnabled(item, SHOW_TRIGGERS_METADATA_KEY)) {
        suffix += formatTriggerSuffix(data.byTrigger);
    }
    if (isMetadataFlagEnabled(item, SHOW_RECLAIMED_METADATA_KEY)) {
        suffix += formatReclaimedSuffix(data.tokensReclaimed, item, format);
    }
    return formatColoredValue(item, getCountLabel(getFormat(item), icon), String(data.count), data.count, COUNT_SCALE, formatOptions, suffix);
}

function getCountLabel(format: CompactionCounterFormat, icon: string): string {
    switch (format) {
        case 'icon-space-number': return `${icon} `;
        case 'text-and-number': return 'Compactions: ';
        case 'number': return '';
    }
}

/**
 * Displays a count of context compaction events in the current session.
 *
 * Claude Code periodically compacts (summarizes) conversation context when it
 * approaches the context window limit. This widget tracks how many times
 * compaction has occurred by counting compact_boundary markers in the transcript.
 *
 * Shows ↻ N by default, including ↻ 0 before compaction occurs. Can be
 * configured to hide when count is 0. A `metric` selector switches it to emit a
 * single raw value (count, auto, manual, unknown, or reclaimed) so several
 * instances can be composed into a custom layout.
 */
export class CompactionCounterWidget implements Widget {
    getDefaultColor(): string { return DEFAULT_COLOR; }
    getDescription(): string { return 'Count of context compaction events in the current session.'; }
    getDisplayName(): string { return 'Compaction Counter'; }
    getCategory(): string { return 'Context'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const metric = getMetric(item);
        const modifiers: string[] = [];

        if (metric !== DEFAULT_METRIC) {
            modifiers.push(`${metric} value`);
        } else {
            modifiers.push(getFormat(item));
            if (isNerdFontEnabled(item, NERD_FONT_FORMATS)) {
                modifiers.push('nerd font');
            }
            if (isMetadataFlagEnabled(item, SHOW_TRIGGERS_METADATA_KEY)) {
                modifiers.push('trigger split');
            }
            if (isMetadataFlagEnabled(item, SHOW_RECLAIMED_METADATA_KEY)) {
                modifiers.push('reclaimed');
            }
        }
        const valueColors = hasValueColors(item) ? getValueColorsModifier(item) : null;
        if (valueColors) {
            modifiers.push(valueColors);
        }

        return {
            displayText: 'Compaction Counter',
            modifierText: `(${modifiers.join(', ')})`
        };
    }

    getHideableStates(): HideableState[] {
        return [ZERO_HIDEABLE_STATE];
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action === CYCLE_METRIC_ACTION) {
            const currentMetric = getMetric(item);
            const nextMetric = METRICS[(METRICS.indexOf(currentMetric) + 1) % METRICS.length] ?? DEFAULT_METRIC;

            return setMetric(item, nextMetric);
        }

        if (action === CYCLE_FORMAT_ACTION) {
            const currentFormat = getFormat(item);
            const nextFormat = FORMATS[(FORMATS.indexOf(currentFormat) + 1) % FORMATS.length] ?? DEFAULT_FORMAT;

            return setNerdFontFormat(item, nextFormat, NERD_FONT_FORMATS);
        }

        if (action === TOGGLE_NERD_FONT_ACTION) {
            return toggleNerdFont(item, NERD_FONT_FORMATS);
        }

        if (action === TOGGLE_TRIGGERS_ACTION) {
            return toggleMetadataFlag(item, SHOW_TRIGGERS_METADATA_KEY);
        }

        if (action === TOGGLE_RECLAIMED_ACTION) {
            return toggleMetadataFlag(item, SHOW_RECLAIMED_METADATA_KEY);
        }

        return null;
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const format = resolveNumberFormat('token', item, settings);
        const formatOptions = getValueFormatOptions(settings, item.color ?? DEFAULT_COLOR);
        const data = context.isPreview ? SAMPLE_STATS : (context.compactionData ?? ZERO_COMPACTION_STATS);
        const metric = getMetric(item);

        if (metric !== DEFAULT_METRIC) {
            const value = getMetricValue(data, metric);
            if (value === 0 && isHidden(item, ZERO_HIDEABLE_STATE.key) && !context.isPreview) {
                return null;
            }
            return metric === 'reclaimed'
                ? formatTokens(value, format)
                : formatColoredValue(item, '', String(value), value, COUNT_SCALE, formatOptions);
        }

        if (data.count === 0 && isHidden(item, ZERO_HIDEABLE_STATE.key) && !context.isPreview) {
            return null;
        }

        const icon = isNerdFontEnabled(item, NERD_FONT_FORMATS) ? COMPACTION_NERD_FONT_ICON : COMPACTION_ICON;
        return formatStats(data, item, icon, format, formatOptions);
    }

    getCustomKeybinds(item?: WidgetItem): CustomKeybind[] {
        const keybinds: CustomKeybind[] = [
            { key: 'v', label: '(v)alue', action: CYCLE_METRIC_ACTION }
        ];

        // The format / glyph / trigger toggles only shape the composite 'count'
        // display; a single-metric value just needs the metric selector, since
        // hide-zero is one of the states in the shared hide checklist.
        if (item !== undefined && getMetric(item) !== DEFAULT_METRIC) {
            return hasValueColors(item) ? [...keybinds, VALUE_COLORS_KEYBIND] : keybinds;
        }

        keybinds.push({ key: 'f', label: '(f)ormat', action: CYCLE_FORMAT_ACTION });
        if (item === undefined || canUseNerdFont(item)) {
            keybinds.push({ key: 'n', label: '(n)erd font', action: TOGGLE_NERD_FONT_ACTION });
        }
        keybinds.push({ key: 's', label: '(s)plit by trigger', action: TOGGLE_TRIGGERS_ACTION });
        keybinds.push({ key: 't', label: '(t)okens reclaimed', action: TOGGLE_RECLAIMED_ACTION });
        keybinds.push(getSymbolKeybind());
        keybinds.push(VALUE_COLORS_KEYBIND);

        return keybinds;
    }

    renderEditor(props: WidgetEditorProps) {
        if (props.action === EDIT_VALUE_COLORS_ACTION) {
            return renderValueColorsEditor(props, {
                title: 'Compaction Counter: value colors',
                scale: COUNT_SCALE,
                sampleNote: 'compactions',
                defaultColor: DEFAULT_COLOR
            });
        }
        return renderSymbolSlotsEditor(props, [RECLAIMED_SLOT]);
    }

    // Value colors embed their own foreground codes, so the renderer must
    // leave this widget's foreground alone while they're on
    preservesRenderedColors(item: WidgetItem): boolean {
        return hasValueColors(item) && isValueColorsEnabled(item);
    }

    supportsRawValue(): boolean { return false; }
    supportsColors(item: WidgetItem): boolean { return true; }
    supportsNumberFormat(): boolean { return true; }
}
