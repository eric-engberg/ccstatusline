import {
    getColorLevelString,
    type ColorLevelString
} from '../../types/ColorLevel';
import type { Settings } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import { getColorAnsiCode } from '../../utils/colors';

import { paintCode } from './foreground';
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
import { getLabel } from './raw-or-labeled';

// Optional coloring of a widget's value by how high it runs: green, yellow and
// red bands split at two break points, or a gradient that reaches its end color
// at a set value.
// Values are percents, e.g. of a budget or a limit. Every option stores nothing
// while at its default, so a widget nobody has customized keeps an empty
// metadata object.
const VALUE_COLORS_KEY = 'valueColors';
const MODE_KEY = 'valueColorMode';
const GRADIENT_KEY = 'valueGradient';
const GRADIENT_END_KEY = 'valueGradientEnd';
const SCOPE_KEY = 'valueColorScope';
const BAND_COLOR_KEY_PREFIX = 'valueColor.';
const BREAK_POINT_KEYS = { midFrom: 'valueMidFrom', highFrom: 'valueHighFrom' } as const;

export const VALUE_BANDS = ['low', 'mid', 'high'] as const;
export type ValueBand = typeof VALUE_BANDS[number];
export type ValueColorMode = 'breakpoints' | 'gradient';
// What takes the value's color: the value alone, or the label with it
export type ValueColorScope = 'value' | 'widget';
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
// Break points and the gradient's end are whole percents. Every widget's
// gradient ends by default at the whole of what it measures against: the limit,
// or Extra Usage Today's budget.
const DEFAULT_GRADIENT_END = 100;
const PERCENT_STEP = 5;
const MIN_PERCENT = 1;
const MAX_PERCENT = 999;
const PERCENT_ERROR = `Use a whole number from ${MIN_PERCENT} to ${MAX_PERCENT}.`;

/** Each widget's default break points (percent) and which band a value exactly at the high one is in. */
export interface ValueColorScale {
    midFrom: number;
    highFrom: number;
    // 'from': high starts at highFrom; 'above': highFrom itself is still mid
    highEdge: 'from' | 'above';
    // A higher value is the good one (Cache Hit Rate): the bands default to
    // red, yellow and green, and a gradient runs from its urgent end
    higherIsBetter?: boolean;
}

/** Spend against the monthly limit (Extra Usage Utilization and Used): green below 70%, yellow below 90%, red from 90%. */
export const LIMIT_SCALE: ValueColorScale = { midFrom: 70, highFrom: 90, highEdge: 'from' };

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

export function getValueColorScope(item: WidgetItem): ValueColorScope {
    return item.metadata?.[SCOPE_KEY] === 'widget' ? 'widget' : 'value';
}

export function setValueColorScope(item: WidgetItem, scope: ValueColorScope): WidgetItem {
    return setMetadataValue(item, SCOPE_KEY, scope === 'widget' ? 'widget' : null);
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

function readBreakPoint(item: WidgetItem, which: BreakPoint, fallback: number): number {
    const stored = Number.parseInt(item.metadata?.[BREAK_POINT_KEYS[which]] ?? '', 10);
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

// The range a break point can take without passing the other one
function getBreakPointRange(item: WidgetItem, scale: ValueColorScale, which: BreakPoint): { min: number; max: number } {
    const { midFrom, highFrom } = getBreakPoints(item, scale);
    return which === 'midFrom'
        ? { min: MIN_PERCENT, max: highFrom - 1 }
        : { min: midFrom + 1, max: MAX_PERCENT };
}

// The next multiple of the step in that direction, so a percent that's off
// them (held next to a break point, or typed) steps back onto them
function stepPercent(current: number, direction: 1 | -1): number {
    return direction === 1
        ? (Math.floor(current / PERCENT_STEP) + 1) * PERCENT_STEP
        : (Math.ceil(current / PERCENT_STEP) - 1) * PERCENT_STEP;
}

// A typed percent, or null when it isn't a whole number in range
function parsePercent(text: string): number | null {
    const value = /^\d+$/.test(text.trim()) ? Number.parseInt(text, 10) : Number.NaN;
    return Number.isNaN(value) || value < MIN_PERCENT || value > MAX_PERCENT ? null : value;
}

export function stepBreakPoint(item: WidgetItem, scale: ValueColorScale, which: BreakPoint, direction: 1 | -1): WidgetItem {
    const { min, max } = getBreakPointRange(item, scale, which);
    const stepped = stepPercent(getBreakPoints(item, scale)[which], direction);
    return setBreakPoint(item, scale, which, Math.min(max, Math.max(min, stepped)));
}

/** A typed break point: the updated item, or the error to show. */
export function typeBreakPoint(item: WidgetItem, scale: ValueColorScale, which: BreakPoint, text: string): WidgetItem | string {
    const value = parsePercent(text);
    if (value === null) {
        return PERCENT_ERROR;
    }

    const { midFrom, highFrom } = getBreakPoints(item, scale);
    const { min, max } = getBreakPointRange(item, scale, which);
    if (value > max) {
        return `Mid has to start below high (${highFrom}%).`;
    }
    if (value < min) {
        return `High has to start above mid (${midFrom}%).`;
    }
    return setBreakPoint(item, scale, which, value);
}

// Where the gradient reaches its last color; values past it stay that color
export function getGradientEnd(item: WidgetItem): number {
    const stored = Number.parseInt(item.metadata?.[GRADIENT_END_KEY] ?? '', 10);
    return Number.isNaN(stored) || stored < MIN_PERCENT ? DEFAULT_GRADIENT_END : stored;
}

function setGradientEnd(item: WidgetItem, value: number): WidgetItem {
    return setMetadataValue(item, GRADIENT_END_KEY, value === DEFAULT_GRADIENT_END ? null : String(value));
}

export function stepGradientEnd(item: WidgetItem, direction: 1 | -1): WidgetItem {
    const stepped = stepPercent(getGradientEnd(item), direction);
    return setGradientEnd(item, Math.min(MAX_PERCENT, Math.max(MIN_PERCENT, stepped)));
}

/** A typed gradient end: the updated item, or the error to show. */
export function typeGradientEnd(item: WidgetItem, text: string): WidgetItem | string {
    const value = parsePercent(text);
    return value === null ? PERCENT_ERROR : setGradientEnd(item, value);
}

// The line editor's modifier, e.g. "value colors: thermal gradient". Unlike a
// bar gradient's "gradient: thermal", it gets no "needs truecolor" note: a
// value's gradient shows at 256 colors too.
export function getValueColorsModifier(item: WidgetItem): string | null {
    if (!isValueColorsEnabled(item)) {
        return null;
    }
    const mode = getValueColorMode(item) === 'gradient' ? `value colors: ${getValueGradient(item)} gradient` : 'value colors';
    return getValueColorScope(item) === 'widget' ? `${mode}, whole widget` : mode;
}

/** (d)efaults: colors, break points, mode, gradient and its end, and what's colored; value colors stay on or off. */
export function resetValueColors(item: WidgetItem): WidgetItem {
    const keys = Object.keys(item.metadata ?? {}).filter(key => key.startsWith(BAND_COLOR_KEY_PREFIX));
    return removeMetadataKeys(item, [...keys, MODE_KEY, GRADIENT_KEY, GRADIENT_END_KEY, SCOPE_KEY, ...Object.values(BREAK_POINT_KEYS)]);
}

export function getValueBand(item: WidgetItem, percent: number, scale: ValueColorScale): ValueBand {
    const { midFrom, highFrom } = getBreakPoints(item, scale);
    const isHigh = scale.highEdge === 'from' ? percent >= highFrom : percent > highFrom;
    if (isHigh) {
        return 'high';
    }
    return percent >= midFrom ? 'mid' : 'low';
}

// A gradient runs from its first color at 0 to its last at the gradient's end.
// 16 colors are too few for one, so there the value keeps the widget color
// (null).
export function getValueColorCode(item: WidgetItem, percent: number, scale: ValueColorScale, colorLevel: ColorLevelString): string | null {
    if (getValueColorMode(item) === 'gradient') {
        if (colorLevel === 'ansi16') {
            return null;
        }
        const share = Math.min(1, Math.max(0, percent / getGradientEnd(item)));
        const position = scale.higherIsBetter ? 1 - share : share;
        return gradientPresetCodeAt(getValueGradient(item), position, colorLevel);
    }
    return getColorAnsiCode(getBandColor(item, getValueBand(item, percent, scale), scale), colorLevel);
}

export interface ValueFormatOptions {
    colorLevel: ColorLevelString;
    colorsDisabled: boolean;
}

export function getValueFormatOptions(settings: Settings): ValueFormatOptions {
    return {
        colorLevel: getColorLevelString(settings.colorLevel),
        colorsDisabled: settings.colorLevel === 0
    };
}

/**
 * The value colored by its percent, and the label with it when the whole widget
 * is colored. Only that run is painted, ending with the default-foreground
 * code; the renderer colors the rest, and a value with no percent (or no
 * color at 16 colors), with the widget color (Widget.colorsOnlyItsRuns).
 */
export function formatColoredValue(
    item: WidgetItem,
    label: string,
    value: string,
    percent: number | null,
    scale: ValueColorScale,
    options: ValueFormatOptions
): string {
    const shownLabel = item.rawValue ? '' : getLabel(item, label);
    if (!isValueColorsEnabled(item) || options.colorsDisabled) {
        return `${shownLabel}${value}`;
    }

    const valueCode = (percent === null ? null : getValueColorCode(item, percent, scale, options.colorLevel)) ?? '';
    if (getValueColorScope(item) === 'widget') {
        return paintCode(`${shownLabel}${value}`, valueCode);
    }
    return `${shownLabel}${paintCode(value, valueCode)}`;
}
