import React from 'react';

import type { Settings } from '../../types/Settings';
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
    getGradientEnd,
    getScaleUnit,
    getValueColorMode,
    getValueFormatOptions,
    getValueGradient,
    isValueColorsEnabled,
    resetValueColors,
    setBandColor,
    setValueColorMode,
    setValueColorsEnabled,
    stepBreakPoint,
    stepGradientEnd,
    typeBreakPoint,
    typeGradientEnd,
    type BreakPoint,
    type ValueBand,
    type ValueColorScale,
    type ValueFormatOptions
} from './value-coloring';
import {
    floorToUnit,
    roundToUnit
} from './value-units';

export const EDIT_VALUE_COLORS_ACTION = 'edit-value-colors';
export const VALUE_COLORS_KEYBIND: CustomKeybind = { key: 'v', label: '(v)alue colors', action: EDIT_VALUE_COLORS_ACTION };

// (v) on a widget whose other modes (a bar, the level glyph) have no value to
// color: offered while it shows the plain value
export function withValueColorsKeybind(keybinds: CustomKeybind[], showsValue: boolean): CustomKeybind[] {
    return showsValue ? [...keybinds, VALUE_COLORS_KEYBIND] : keybinds;
}

type ValueSetting = 'mode' | BreakPoint | 'gradient' | 'gradientEnd';
const BREAK_POINTS: ReadonlySet<ValueSetting> = new Set<BreakPoint>(['midFrom', 'highFrom']);
// Gradient mode's own rows; the band colors and break points are break points mode's
const GRADIENT_ROWS: ReadonlySet<ValueBand | ValueSetting> = new Set(['gradient', 'gradientEnd']);

function isBreakPoint(setting: ValueSetting): setting is BreakPoint {
    return BREAK_POINTS.has(setting);
}

export interface ValueColorsEditorOptions {
    title: string;
    scale: ValueColorScale;
    /** What the sample's values are of, e.g. "of today's budget". */
    sampleNote: string;
    /** The widget's color when it has none of its own. */
    defaultColor: string;
    /** The highest percent the widget can show, e.g. 100 for a utilization. */
    maxPercent?: number;
}

// Values on both sides of each break point, or along the gradient and past its
// end. Half the mid break point rounds down, so a count's mid of 1 still has a
// sample (0) below it.
function getSampleValues(item: WidgetItem, options: ValueColorsEditorOptions): number[] {
    const unit = getScaleUnit(options.scale);
    let values: number[];
    if (getValueColorMode(item) === 'gradient') {
        const end = getGradientEnd(item, options.scale);
        values = [0.25, 0.5, 0.75, 1, 1.25].map(fraction => roundToUnit(unit, end * fraction));
    } else {
        const { midFrom, highFrom } = getBreakPoints(item, options.scale);
        values = [floorToUnit(unit, midFrom / 2), midFrom, highFrom, roundToUnit(unit, highFrom + (highFrom - midFrom))];
    }
    return [...new Set(values.map(value => Math.min(options.maxPercent ?? Infinity, value)))];
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

// Without settings (outside the line editor) the sample is drawn at the default 256 colors
export function makeValueColorsConfig(options: ValueColorsEditorOptions, settings?: Settings): ColorListEditorConfig<ValueBand, ValueSetting> {
    const { scale } = options;
    const unit = getScaleUnit(scale);
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
            { kind: 'setting', key: 'highFrom', label: scale.highEdge === 'from' ? 'high from' : 'high above' }
        ],
        // Each mode shows only its own rows
        isRowShown: (item, row) => row.key === 'mode' || isGradient(item) === GRADIENT_ROWS.has(row.key),
        getNotice: item => (isGradient(item) ? getGradientNotice(settings) : null),
        isEnabled: isValueColorsEnabled,
        setEnabled: setValueColorsEnabled,
        getColor: (item, band) => getBandColor(item, band, scale),
        setColor: (item, band, color) => setBandColor(item, band, color, scale),
        getSettingLabel: (item, setting) => {
            if (setting === 'mode') {
                return isGradient(item) ? 'Gradient' : 'Break points';
            }
            if (setting === 'gradient') {
                return getValueGradient(item);
            }
            if (setting === 'gradientEnd') {
                return unit.format(getGradientEnd(item, scale));
            }
            return unit.format(getBreakPoints(item, scale)[setting]);
        },
        cycleSetting: (item, setting, direction) => {
            if (setting === 'mode') {
                return setValueColorMode(item, isGradient(item) ? 'breakpoints' : 'gradient');
            }
            if (setting === 'gradient') {
                return cycleValueGradient(item, direction);
            }
            if (setting === 'gradientEnd') {
                return stepGradientEnd(item, scale, direction);
            }
            return stepBreakPoint(item, scale, setting, direction);
        },
        typedSettings: {
            keys: [...BREAK_POINTS, 'gradientEnd'],
            hint: unit.hint,
            set: (item, setting, text) => {
                if (setting === 'gradientEnd') {
                    return typeGradientEnd(item, scale, text);
                }
                return isBreakPoint(setting) ? typeBreakPoint(item, scale, setting, text) : item;
            }
        },
        resetColors: resetValueColors,
        renderSample: (item) => {
            const baseColor = item.color ?? options.defaultColor;
            const formatOptions: ValueFormatOptions = settings
                ? getValueFormatOptions(settings, baseColor)
                : { colorLevel: EDITOR_COLOR_LEVEL, colorsDisabled: false, baseColor };
            const values = getSampleValues(item, options)
                .map(value => formatColoredValue({ ...item, rawValue: true }, '', unit.format(value), value, scale, formatOptions));
            return `${values.join(' ')} ${options.sampleNote}`;
        },
        extraHelp: unit.typeHelp
    };
}

export function renderValueColorsEditor(props: WidgetEditorProps, options: ValueColorsEditorOptions): React.ReactElement {
    return <ColorListEditor {...props} config={makeValueColorsConfig(options, props.settings)} />;
}
