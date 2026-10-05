import React from 'react';

import type {
    CustomKeybind,
    WidgetEditorProps,
    WidgetItem
} from '../../types/Widget';

import {
    ColorListEditor,
    EDITOR_COLOR_LEVEL,
    type ColorListEditorConfig
} from './color-list-editor';
import {
    VALUE_BANDS,
    cycleValueGradient,
    formatColoredValue,
    getBandColor,
    getBreakPoints,
    getValueColorMode,
    getValueGradient,
    isValueColorsEnabled,
    resetValueColors,
    setBandColor,
    setValueColorMode,
    setValueColorsEnabled,
    stepBreakPoint,
    typeBreakPoint,
    type BreakPoint,
    type ValueBand,
    type ValueColorScale
} from './value-coloring';

export const EDIT_VALUE_COLORS_ACTION = 'edit-value-colors';
export const VALUE_COLORS_KEYBIND: CustomKeybind = { key: 'v', label: '(v)alue colors', action: EDIT_VALUE_COLORS_ACTION };

type ValueSetting = 'mode' | BreakPoint | 'gradient';
const BREAK_POINTS: readonly BreakPoint[] = ['midFrom', 'highFrom'];

function isBreakPoint(setting: ValueSetting): setting is BreakPoint {
    return BREAK_POINTS.includes(setting as BreakPoint);
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
}

// Values on both sides of each break point
function getSamplePercents(item: WidgetItem, options: ValueColorsEditorOptions): number[] {
    const { midFrom, highFrom } = getBreakPoints(item, options.scale);
    const percents = [Math.round(midFrom / 2), midFrom, highFrom, highFrom + (highFrom - midFrom)]
        .map(percent => Math.min(options.maxPercent ?? Infinity, percent));
    return [...new Set(percents)];
}

export function makeValueColorsConfig(options: ValueColorsEditorOptions): ColorListEditorConfig<ValueBand, ValueSetting> {
    const { scale } = options;

    return {
        title: options.title,
        toggleLabel: 'Value colors',
        rows: [
            { kind: 'setting', key: 'mode', label: 'mode' },
            ...VALUE_BANDS.map(band => ({ kind: 'color' as const, key: band, label: band })),
            { kind: 'setting', key: 'midFrom', label: 'mid from' },
            { kind: 'setting', key: 'highFrom', label: scale.highEdge === 'from' ? 'high from' : 'high above' },
            { kind: 'setting', key: 'gradient', label: 'gradient' }
        ],
        isEnabled: isValueColorsEnabled,
        setEnabled: setValueColorsEnabled,
        getColor: getBandColor,
        setColor: setBandColor,
        getSettingLabel: (item, setting) => {
            if (setting === 'mode') {
                return getValueColorMode(item) === 'gradient' ? 'Gradient (truecolor only)' : 'Break points';
            }
            if (setting === 'gradient') {
                return getValueGradient(item);
            }
            return `${getBreakPoints(item, scale)[setting]}%`;
        },
        cycleSetting: (item, setting, direction) => {
            if (setting === 'mode') {
                return setValueColorMode(item, getValueColorMode(item) === 'gradient' ? 'breakpoints' : 'gradient');
            }
            if (setting === 'gradient') {
                return cycleValueGradient(item, direction);
            }
            return stepBreakPoint(item, scale, setting, direction);
        },
        typedSettings: {
            keys: BREAK_POINTS,
            hint: 'percent, 1-999',
            set: (item, setting, text) => (isBreakPoint(setting) ? typeBreakPoint(item, scale, setting, text) : item)
        },
        resetColors: resetValueColors,
        // A gradient only shows on truecolor terminals, so that's how its
        // sample is drawn; the mode row says so
        renderSample: (item) => {
            const colorLevel = getValueColorMode(item) === 'gradient' ? 'truecolor' : EDITOR_COLOR_LEVEL;
            const values = getSamplePercents(item, options).map(percent => formatColoredValue({ ...item, rawValue: true }, '', `${percent}%`, percent, scale, {
                colorLevel,
                colorsDisabled: false,
                baseColor: item.color ?? options.defaultColor
            }));
            return `${values.join(' ')} ${options.sampleNote}`;
        },
        extraHelp: 'Type a number on a break point row to set it exactly'
    };
}

export function renderValueColorsEditor(props: WidgetEditorProps, config: ColorListEditorConfig<ValueBand, ValueSetting>): React.ReactElement {
    return <ColorListEditor {...props} config={config} />;
}
