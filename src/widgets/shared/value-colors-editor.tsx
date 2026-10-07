import React from 'react';

import type { Settings } from '../../types/Settings';
import type {
    CustomKeybind,
    WidgetEditorProps,
    WidgetItem
} from '../../types/Widget';

import {
    ColorListEditor,
    type ColorListEditorConfig
} from './color-list-editor';
import {
    VALUE_BANDS,
    cycleValueGradient,
    formatColoredValue,
    getBandColor,
    getBreakPoints,
    getGradientEnd,
    getValueColorMode,
    getValueColorScope,
    getValueGradient,
    isValueColorsEnabled,
    resetValueColors,
    setBandColor,
    setValueColorMode,
    setValueColorScope,
    setValueColorsEnabled,
    stepBreakPoint,
    stepGradientEnd,
    typeBreakPoint,
    typeGradientEnd,
    type BreakPoint,
    type ValueBand,
    type ValueColorScale
} from './value-coloring';

export const EDIT_VALUE_COLORS_ACTION = 'edit-value-colors';
export const VALUE_COLORS_KEYBIND: CustomKeybind = { key: 'v', label: '(v)alue colors', action: EDIT_VALUE_COLORS_ACTION };

type ValueSetting = 'mode' | BreakPoint | 'gradient' | 'gradientEnd' | 'scope';
const BREAK_POINTS: ReadonlySet<ValueSetting> = new Set<BreakPoint>(['midFrom', 'highFrom']);
// Gradient mode's own rows; the band colors and break points are break points mode's
const GRADIENT_ROWS: ReadonlySet<ValueBand | ValueSetting> = new Set(['gradient', 'gradientEnd']);
// Rows both modes show
const SHARED_ROWS: ReadonlySet<ValueBand | ValueSetting> = new Set(['mode', 'scope']);

function isBreakPoint(setting: ValueSetting): setting is BreakPoint {
    return BREAK_POINTS.has(setting);
}

export interface ValueColorsEditorOptions {
    title: string;
    scale: ValueColorScale;
    /** What the sample's percents are of, e.g. "of today's budget". */
    sampleNote: string;
    /** The widget's color when it has none of its own. */
    defaultColor: string;
    /** The highest percent the widget can show, e.g. 100 for a utilization. */
    maxPercent?: number;
    /** The widget's default label, for the sample while the whole widget is colored. */
    label?: string;
    /**
     * The widget shows what's left of 100%, while its colors follow the share
     * used, so the sample shows what's left in the color of what's used.
     */
    showsRemaining?: boolean;
}

// Values on both sides of each break point, or along the gradient and past its end
function getSamplePercents(item: WidgetItem, options: ValueColorsEditorOptions): number[] {
    let percents: number[];
    if (getValueColorMode(item) === 'gradient') {
        const end = getGradientEnd(item);
        percents = [0.25, 0.5, 0.75, 1, 1.25].map(fraction => Math.round(end * fraction));
    } else {
        const { midFrom, highFrom } = getBreakPoints(item, options.scale);
        percents = [Math.round(midFrom / 2), midFrom, highFrom, highFrom + (highFrom - midFrom)];
    }
    return [...new Set(percents.map(percent => Math.min(options.maxPercent ?? Infinity, percent)))];
}

// What a gradient looks like at the color level set in Terminal Options
function getGradientNotice(settings: Settings | undefined): string | null {
    switch (settings?.colorLevel) {
        case 0:
            return 'Color Level is No Color, so the value isn\'t colored. Set Truecolor in Terminal Options.';
        case 1:
            return 'Color Level is Basic (16 colors), too few for a gradient, so the value keeps the widget color. Set Truecolor in Terminal Options, or use break points.';
        case 2:
            return 'Color Level is 256 Color, so the gradient moves in coarse steps. Set Truecolor in Terminal Options for a smooth one.';
        default:
            return null;
    }
}

// Without settings (outside the line editor) there's no color level to warn about
export function makeValueColorsConfig(options: ValueColorsEditorOptions, settings?: Settings): ColorListEditorConfig<ValueBand, ValueSetting> {
    const { scale } = options;
    const isGradient = (item: WidgetItem) => getValueColorMode(item) === 'gradient';

    return {
        title: options.title,
        toggleLabel: 'Value colors',
        rows: [
            { kind: 'setting', key: 'mode', label: 'mode' },
            { kind: 'setting', key: 'gradient', label: 'gradient' },
            { kind: 'setting', key: 'gradientEnd', label: 'ends at' },
            ...VALUE_BANDS.map(band => ({ kind: 'color' as const, key: band, label: band })),
            { kind: 'setting', key: 'midFrom', label: 'mid from' },
            { kind: 'setting', key: 'highFrom', label: scale.highEdge === 'from' ? 'high from' : 'high above' },
            { kind: 'setting', key: 'scope', label: 'colors' }
        ],
        // Each mode shows only its own rows, besides the ones they share
        isRowShown: (item, row) => SHARED_ROWS.has(row.key) || isGradient(item) === GRADIENT_ROWS.has(row.key),
        getNotice: item => (isGradient(item) ? getGradientNotice(settings) : null),
        isEnabled: isValueColorsEnabled,
        setEnabled: setValueColorsEnabled,
        getColor: getBandColor,
        setColor: setBandColor,
        getSettingLabel: (item, setting) => {
            if (setting === 'mode') {
                return isGradient(item) ? 'Gradient' : 'Break points';
            }
            if (setting === 'scope') {
                return getValueColorScope(item) === 'widget' ? 'Whole widget' : 'Value only';
            }
            if (setting === 'gradient') {
                return getValueGradient(item);
            }
            if (setting === 'gradientEnd') {
                return `${getGradientEnd(item)}%`;
            }
            return `${getBreakPoints(item, scale)[setting]}%`;
        },
        cycleSetting: (item, setting, direction) => {
            if (setting === 'mode') {
                return setValueColorMode(item, isGradient(item) ? 'breakpoints' : 'gradient');
            }
            if (setting === 'scope') {
                return setValueColorScope(item, getValueColorScope(item) === 'widget' ? 'value' : 'widget');
            }
            if (setting === 'gradient') {
                return cycleValueGradient(item, direction);
            }
            if (setting === 'gradientEnd') {
                return stepGradientEnd(item, direction);
            }
            return stepBreakPoint(item, scale, setting, direction);
        },
        typedSettings: {
            keys: [...BREAK_POINTS, 'gradientEnd'],
            hint: 'percent, 1-999',
            set: (item, setting, text) => {
                if (setting === 'gradientEnd') {
                    return typeGradientEnd(item, text);
                }
                return isBreakPoint(setting) ? typeBreakPoint(item, scale, setting, text) : item;
            }
        },
        resetColors: resetValueColors,
        renderSample: (item, _band, colors) => {
            // With the whole widget colored, each value is shown with its label
            const withLabel = getValueColorScope(item) === 'widget' && options.label !== undefined && !item.rawValue;
            const values = getSamplePercents(item, options).map((percent) => {
                const shown = options.showsRemaining ? 100 - percent : percent;
                return formatColoredValue({ ...item, rawValue: !withLabel }, options.label ?? '', `${shown}%`, percent, scale, colors);
            });
            return values.join(withLabel ? '  ' : ' ');
        },
        sampleNote: options.sampleNote,
        defaultColor: options.defaultColor,
        extraHelp: 'Type a number on a percent row to set it exactly'
    };
}

export function renderValueColorsEditor(props: WidgetEditorProps, options: ValueColorsEditorOptions): React.ReactElement {
    return <ColorListEditor {...props} config={makeValueColorsConfig(options, props.settings)} />;
}
