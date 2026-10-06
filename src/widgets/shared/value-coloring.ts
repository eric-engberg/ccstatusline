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

// Optional coloring of a widget's value by how high it runs: green, yellow and
// red bands split at two break points, or a gradient on truecolor terminals.
// Values are percents, e.g. of a budget or a limit. Every option stores nothing
// while at its default, so a widget nobody has customized keeps an empty
// metadata object.
const VALUE_COLORS_KEY = 'valueColors';
const MODE_KEY = 'valueColorMode';
const GRADIENT_KEY = 'valueGradient';
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
const DEFAULT_GRADIENT: BarGradientPreset = 'traffic';
const BREAK_POINT_STEP = 5;
const MIN_BREAK_POINT = 1;
const MAX_BREAK_POINT = 999;

/** Each widget's default break points (percent) and which band a value exactly at the high one is in. */
export interface ValueColorScale {
    midFrom: number;
    highFrom: number;
    // 'from': high starts at highFrom; 'above': highFrom itself is still mid
    highEdge: 'from' | 'above';
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

export function getBandColor(item: WidgetItem, band: ValueBand): string {
    return item.metadata?.[`${BAND_COLOR_KEY_PREFIX}${band}`] ?? DEFAULT_BAND_COLORS[band];
}

export function setBandColor(item: WidgetItem, band: ValueBand, color: string): WidgetItem {
    return setMetadataValue(item, `${BAND_COLOR_KEY_PREFIX}${band}`, color === DEFAULT_BAND_COLORS[band] ? null : color);
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
        ? { min: MIN_BREAK_POINT, max: highFrom - 1 }
        : { min: midFrom + 1, max: MAX_BREAK_POINT };
}

// Steps land on multiples of the step, so a break point that's off them (held
// next to the other one, or typed) steps back onto them
export function stepBreakPoint(item: WidgetItem, scale: ValueColorScale, which: BreakPoint, direction: 1 | -1): WidgetItem {
    const { min, max } = getBreakPointRange(item, scale, which);
    const current = getBreakPoints(item, scale)[which];
    const stepped = direction === 1
        ? (Math.floor(current / BREAK_POINT_STEP) + 1) * BREAK_POINT_STEP
        : (Math.ceil(current / BREAK_POINT_STEP) - 1) * BREAK_POINT_STEP;
    return setBreakPoint(item, scale, which, Math.min(max, Math.max(min, stepped)));
}

/** A typed break point: the updated item, or the error to show. */
export function typeBreakPoint(item: WidgetItem, scale: ValueColorScale, which: BreakPoint, text: string): WidgetItem | string {
    const value = /^\d+$/.test(text.trim()) ? Number.parseInt(text, 10) : Number.NaN;
    if (Number.isNaN(value) || value < MIN_BREAK_POINT || value > MAX_BREAK_POINT) {
        return `Use a whole number from ${MIN_BREAK_POINT} to ${MAX_BREAK_POINT}.`;
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

// The line editor's modifier, e.g. "value gradient: thermal"; the "gradient:"
// form lets the line editor add "needs truecolor" below truecolor, as it does
// for bar gradients
export function getValueColorsModifier(item: WidgetItem): string | null {
    if (!isValueColorsEnabled(item)) {
        return null;
    }
    return getValueColorMode(item) === 'gradient' ? `value gradient: ${getValueGradient(item)}` : 'value colors';
}

/** (d)efaults: colors, break points, mode and gradient; value colors stay on or off. */
export function resetValueColors(item: WidgetItem): WidgetItem {
    const keys = Object.keys(item.metadata ?? {}).filter(key => key.startsWith(BAND_COLOR_KEY_PREFIX));
    return removeMetadataKeys(item, [...keys, MODE_KEY, GRADIENT_KEY, ...Object.values(BREAK_POINT_KEYS)]);
}

export function getValueBand(item: WidgetItem, percent: number, scale: ValueColorScale): ValueBand {
    const { midFrom, highFrom } = getBreakPoints(item, scale);
    const isHigh = scale.highEdge === 'from' ? percent >= highFrom : percent > highFrom;
    if (isHigh) {
        return 'high';
    }
    return percent >= midFrom ? 'mid' : 'low';
}

// A gradient needs truecolor; below it the break points apply. The gradient
// reaches its end color where the high band would start.
export function getValueColorCode(item: WidgetItem, percent: number, scale: ValueColorScale, colorLevel: ColorLevelString): string {
    if (getValueColorMode(item) === 'gradient' && colorLevel === 'truecolor') {
        const { highFrom } = getBreakPoints(item, scale);
        return gradientPresetCodeAt(getValueGradient(item), Math.min(1, Math.max(0, percent / highFrom)));
    }
    return getColorAnsiCode(getBandColor(item, getValueBand(item, percent, scale)), colorLevel);
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

/** The value colored by its percent; a null percent keeps the widget color. */
export function formatColoredValue(
    item: WidgetItem,
    label: string,
    value: string,
    percent: number | null,
    scale: ValueColorScale,
    options: ValueFormatOptions
): string {
    const shownLabel = item.rawValue ? '' : label;
    if (!isValueColorsEnabled(item) || options.colorsDisabled) {
        return `${shownLabel}${value}`;
    }

    const valueCode = percent === null
        ? getColorAnsiCode(options.baseColor, options.colorLevel)
        : getValueColorCode(item, percent, scale, options.colorLevel);
    return `${paintForeground(shownLabel, options.baseColor, options.colorLevel)}${paintCode(value, valueCode)}`;
}
