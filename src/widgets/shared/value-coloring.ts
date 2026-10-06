import {
    getColorLevelString,
    type ColorLevelString
} from '../../types/ColorLevel';
import type { Settings } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import { getColorAnsiCode } from '../../utils/colors';

import {
    paintCode,
    paintForeground
} from './foreground';
import {
    BAR_GRADIENT_PRESETS,
    gradientPresetCodeAt,
    isBarGradientPreset,
    type BarGradientPreset
} from './gradient-bar';
import {
    removeMetadataKeys,
    setMetadataValue
} from './metadata';
import {
    DOLLARS_PER_HOUR_UNIT,
    PERCENT_UNIT,
    parseUnitValue,
    roundToUnit,
    type ValueUnit
} from './value-units';

// Optional coloring of a widget's value by how high it runs: green, yellow and
// red bands split at two break points, or a gradient that reaches its end color
// at a set value.
// Values are percents, e.g. of a budget or a limit, or amounts in a scale's own
// unit, e.g. dollars. Every option stores nothing while at its default, so a
// widget nobody has customized keeps an empty metadata object.
const VALUE_COLORS_KEY = 'valueColors';
const MODE_KEY = 'valueColorMode';
const GRADIENT_KEY = 'valueGradient';
const GRADIENT_END_KEY = 'valueGradientEnd';
const BAND_COLOR_KEY_PREFIX = 'valueColor.';
const BREAK_POINT_KEYS = { midFrom: 'valueMidFrom', highFrom: 'valueHighFrom' } as const;

export const VALUE_BANDS = ['low', 'mid', 'high'] as const;
export type ValueBand = typeof VALUE_BANDS[number];
export type ValueColorMode = 'breakpoints' | 'gradient';
export type BreakPoint = keyof typeof BREAK_POINT_KEYS;

const DEFAULT_BAND_COLORS: Record<ValueBand, string> = {
    low: 'green',
    mid: 'yellow',
    high: 'red'
};
// For a scale where higher is better, e.g. a cache hit rate
const HIGHER_IS_BETTER_BAND_COLORS: Record<ValueBand, string> = {
    low: 'red',
    mid: 'yellow',
    high: 'green'
};
const DEFAULT_GRADIENT: BarGradientPreset = 'traffic';
// A percent scale's gradient ends by default at the whole of what it measures
// against: the limit, or Extra Usage Today's budget.
const DEFAULT_GRADIENT_END = 100;

/** Each widget's default break points and which band a value exactly at the high one is in. */
export interface ValueColorScale {
    midFrom: number;
    highFrom: number;
    // 'from': high starts at highFrom; 'above': highFrom itself is still mid
    highEdge: 'from' | 'above';
    // A higher value is the good one (Cache Hit Rate): the bands default to
    // red, yellow and green, and a gradient runs from its urgent end
    higherIsBetter?: boolean;
    // What the break points and the gradient's end count in; a percent when unset
    unit?: ValueUnit;
    // Where the gradient reaches its last color by default; 100% when unset
    gradientEnd?: number;
}

/** Spend against the monthly limit (Extra Usage Utilization and Used): green below 70%, yellow below 90%, red from 90%. */
export const LIMIT_SCALE: ValueColorScale = { midFrom: 70, highFrom: 90, highEdge: 'from' };

/** Cost per hour (Session Cost Rate and Daily Cost Rate): green below $5/hr, yellow below $15/hr, red from $15/hr. */
export const COST_RATE_SCALE: ValueColorScale = { midFrom: 5, highFrom: 15, highEdge: 'from', unit: DOLLARS_PER_HOUR_UNIT, gradientEnd: 15 };

export function getScaleUnit(scale: ValueColorScale): ValueUnit {
    return scale.unit ?? PERCENT_UNIT;
}

export function isValueColorsEnabled(item: WidgetItem): boolean {
    return item.metadata?.[VALUE_COLORS_KEY] === 'true';
}

export function setValueColorsEnabled(item: WidgetItem, enabled: boolean): WidgetItem {
    return setMetadataValue(item, VALUE_COLORS_KEY, enabled ? 'true' : null);
}

export function getValueColorMode(item: WidgetItem): ValueColorMode {
    return item.metadata?.[MODE_KEY] === 'gradient' ? 'gradient' : 'breakpoints';
}

export function setValueColorMode(item: WidgetItem, mode: ValueColorMode): WidgetItem {
    return setMetadataValue(item, MODE_KEY, mode === 'gradient' ? 'gradient' : null);
}

export function getValueGradient(item: WidgetItem): BarGradientPreset {
    const value = item.metadata?.[GRADIENT_KEY];
    return isBarGradientPreset(value) ? value : DEFAULT_GRADIENT;
}

export function cycleValueGradient(item: WidgetItem, direction: 1 | -1): WidgetItem {
    const index = BAR_GRADIENT_PRESETS.indexOf(getValueGradient(item));
    const next = BAR_GRADIENT_PRESETS[(index + direction + BAR_GRADIENT_PRESETS.length) % BAR_GRADIENT_PRESETS.length] ?? DEFAULT_GRADIENT;
    return setMetadataValue(item, GRADIENT_KEY, next === DEFAULT_GRADIENT ? null : next);
}

function getDefaultBandColor(band: ValueBand, scale: ValueColorScale | undefined): string {
    return (scale?.higherIsBetter ? HIGHER_IS_BETTER_BAND_COLORS : DEFAULT_BAND_COLORS)[band];
}

export function getBandColor(item: WidgetItem, band: ValueBand, scale?: ValueColorScale): string {
    return item.metadata?.[`${BAND_COLOR_KEY_PREFIX}${band}`] ?? getDefaultBandColor(band, scale);
}

export function setBandColor(item: WidgetItem, band: ValueBand, color: string, scale?: ValueColorScale): WidgetItem {
    return setMetadataValue(item, `${BAND_COLOR_KEY_PREFIX}${band}`, color === getDefaultBandColor(band, scale) ? null : color);
}

// Dollar break points can have cents
function readBreakPoint(item: WidgetItem, which: BreakPoint, fallback: number): number {
    const stored = Number.parseFloat(item.metadata?.[BREAK_POINT_KEYS[which]] ?? '');
    return Number.isNaN(stored) ? fallback : stored;
}

export function getBreakPoints(item: WidgetItem, scale: ValueColorScale): { midFrom: number; highFrom: number } {
    return {
        midFrom: readBreakPoint(item, 'midFrom', scale.midFrom),
        highFrom: readBreakPoint(item, 'highFrom', scale.highFrom)
    };
}

function setBreakPoint(item: WidgetItem, scale: ValueColorScale, which: BreakPoint, value: number): WidgetItem {
    return setMetadataValue(item, BREAK_POINT_KEYS[which], value === scale[which] ? null : String(value));
}

// The range a break point can take while staying the unit's smallest
// difference (1%, or a cent) away from the other one
function getBreakPointRange(item: WidgetItem, scale: ValueColorScale, which: BreakPoint): { min: number; max: number } {
    const unit = getScaleUnit(scale);
    const gap = 10 ** -unit.decimals;
    const { midFrom, highFrom } = getBreakPoints(item, scale);
    return which === 'midFrom'
        ? { min: unit.min, max: roundToUnit(unit, highFrom - gap) }
        : { min: roundToUnit(unit, midFrom + gap), max: unit.max };
}

// The next multiple of the unit's step in that direction, so a value that's
// off them (held next to a break point, or typed) steps back onto them
function stepValue(unit: ValueUnit, current: number, direction: 1 | -1): number {
    return direction === 1
        ? (Math.floor(current / unit.step) + 1) * unit.step
        : (Math.ceil(current / unit.step) - 1) * unit.step;
}

export function stepBreakPoint(item: WidgetItem, scale: ValueColorScale, which: BreakPoint, direction: 1 | -1): WidgetItem {
    const { min, max } = getBreakPointRange(item, scale, which);
    const stepped = stepValue(getScaleUnit(scale), getBreakPoints(item, scale)[which], direction);
    return setBreakPoint(item, scale, which, Math.min(max, Math.max(min, stepped)));
}

/** A typed break point: the updated item, or the error to show. */
export function typeBreakPoint(item: WidgetItem, scale: ValueColorScale, which: BreakPoint, text: string): WidgetItem | string {
    const unit = getScaleUnit(scale);
    const value = parseUnitValue(unit, text);
    if (value === null) {
        return unit.error;
    }

    const { midFrom, highFrom } = getBreakPoints(item, scale);
    const { min, max } = getBreakPointRange(item, scale, which);
    if (value > max) {
        return `Mid has to start below high (${unit.format(highFrom)}).`;
    }
    if (value < min) {
        return `High has to start above mid (${unit.format(midFrom)}).`;
    }
    return setBreakPoint(item, scale, which, value);
}

function getDefaultGradientEnd(scale: ValueColorScale): number {
    return scale.gradientEnd ?? DEFAULT_GRADIENT_END;
}

// Where the gradient reaches its last color; values past it stay that color
export function getGradientEnd(item: WidgetItem, scale: ValueColorScale): number {
    const stored = Number.parseFloat(item.metadata?.[GRADIENT_END_KEY] ?? '');
    return Number.isNaN(stored) || stored < getScaleUnit(scale).min ? getDefaultGradientEnd(scale) : stored;
}

function setGradientEnd(item: WidgetItem, scale: ValueColorScale, value: number): WidgetItem {
    return setMetadataValue(item, GRADIENT_END_KEY, value === getDefaultGradientEnd(scale) ? null : String(value));
}

export function stepGradientEnd(item: WidgetItem, scale: ValueColorScale, direction: 1 | -1): WidgetItem {
    const unit = getScaleUnit(scale);
    const stepped = stepValue(unit, getGradientEnd(item, scale), direction);
    return setGradientEnd(item, scale, Math.min(unit.max, Math.max(unit.min, stepped)));
}

/** A typed gradient end: the updated item, or the error to show. */
export function typeGradientEnd(item: WidgetItem, scale: ValueColorScale, text: string): WidgetItem | string {
    const unit = getScaleUnit(scale);
    const value = parseUnitValue(unit, text);
    return value === null ? unit.error : setGradientEnd(item, scale, value);
}

// The line editor's modifier, e.g. "value colors: thermal gradient". Unlike a
// bar gradient's "gradient: thermal", it gets no "needs truecolor" note: a
// value's gradient shows at 256 colors too.
export function getValueColorsModifier(item: WidgetItem): string | null {
    if (!isValueColorsEnabled(item)) {
        return null;
    }
    return getValueColorMode(item) === 'gradient' ? `value colors: ${getValueGradient(item)} gradient` : 'value colors';
}

/** (d)efaults: colors, break points, mode, gradient and its end; value colors stay on or off. */
export function resetValueColors(item: WidgetItem): WidgetItem {
    const keys = Object.keys(item.metadata ?? {}).filter(key => key.startsWith(BAND_COLOR_KEY_PREFIX));
    return removeMetadataKeys(item, [...keys, MODE_KEY, GRADIENT_KEY, GRADIENT_END_KEY, ...Object.values(BREAK_POINT_KEYS)]);
}

// The measure is a percent, or an amount in the scale's unit
export function getValueBand(item: WidgetItem, measure: number, scale: ValueColorScale): ValueBand {
    const { midFrom, highFrom } = getBreakPoints(item, scale);
    const isHigh = scale.highEdge === 'from' ? measure >= highFrom : measure > highFrom;
    if (isHigh) {
        return 'high';
    }
    return measure >= midFrom ? 'mid' : 'low';
}

// A gradient runs from its first color at 0 to its last at the gradient's end.
// 16 colors are too few for one, so there the value keeps the widget color
// (null).
export function getValueColorCode(item: WidgetItem, measure: number, scale: ValueColorScale, colorLevel: ColorLevelString): string | null {
    if (getValueColorMode(item) === 'gradient') {
        if (colorLevel === 'ansi16') {
            return null;
        }
        const share = Math.min(1, Math.max(0, measure / getGradientEnd(item, scale)));
        const position = scale.higherIsBetter ? 1 - share : share;
        return gradientPresetCodeAt(getValueGradient(item), position, colorLevel);
    }
    return getColorAnsiCode(getBandColor(item, getValueBand(item, measure, scale), scale), colorLevel);
}

export interface ValueFormatOptions {
    colorLevel: ColorLevelString;
    colorsDisabled: boolean;
    // The color the renderer would have used for the whole widget; it still
    // owns the label and values with nothing to compare them to
    baseColor: string;
}

export function getValueFormatOptions(settings: Settings, baseColor: string): ValueFormatOptions {
    return {
        colorLevel: getColorLevelString(settings.colorLevel),
        colorsDisabled: settings.colorLevel === 0,
        baseColor
    };
}

/**
 * The value colored by its measure on the scale; a null measure keeps the
 * widget color. The label, and any suffix after the value, stay in the widget
 * color.
 */
export function formatColoredValue(
    item: WidgetItem,
    label: string,
    value: string,
    measure: number | null,
    scale: ValueColorScale,
    options: ValueFormatOptions,
    suffix = ''
): string {
    const shownLabel = item.rawValue ? '' : label;
    if (!isValueColorsEnabled(item) || options.colorsDisabled) {
        return `${shownLabel}${value}${suffix}`;
    }

    const valueCode = (measure === null ? null : getValueColorCode(item, measure, scale, options.colorLevel))
        ?? getColorAnsiCode(options.baseColor, options.colorLevel);
    const paintBase = (text: string) => paintForeground(text, options.baseColor, options.colorLevel);
    return `${paintBase(shownLabel)}${paintCode(value, valueCode)}${paintBase(suffix)}`;
}
