import {
    describe,
    expect,
    it
} from 'vitest';

import { DEFAULT_SETTINGS } from '../../../types/Settings';
import type { WidgetItem } from '../../../types/Widget';
import {
    gradientPresetCodeAt,
    noteGradientNeedsTruecolor
} from '../gradient-bar';
import {
    cycleValueGradient,
    formatColoredValue,
    getBandColor,
    getBreakPoints,
    getValueBand,
    getValueColorCode,
    getValueColorMode,
    getValueColorsModifier,
    getValueGradient,
    isValueColorsEnabled,
    resetValueColors,
    setBandColor,
    setValueColorMode,
    setValueColorsEnabled,
    stepBreakPoint,
    typeBreakPoint,
    type ValueColorScale
} from '../value-coloring';

const base: WidgetItem = { id: 'v', type: 'extra-usage-today' };
// Extra Usage Today: red only above the budget
const BUDGET: ValueColorScale = { midFrom: 80, highFrom: 100, highEdge: 'above' };
// Extra Usage Utilization: red from 90%
const UTILIZATION: ValueColorScale = { midFrom: 70, highFrom: 90, highEdge: 'from' };

const LOW = '\x1b[38;2;0;255;0m';
const MID = '\x1b[38;2;255;255;0m';
const HIGH = '\x1b[38;2;255;0;0m';
const BASE = '\x1b[38;2;17;34;51m';
const FG_RESET = '\x1b[39m';

// Value colors on with custom band colors, so the escape codes don't depend on
// the terminal's color support (named colors go through chalk)
const colored: WidgetItem = {
    ...base,
    metadata: {
        'valueColors': 'true',
        'valueColor.low': 'hex:00ff00',
        'valueColor.mid': 'hex:ffff00',
        'valueColor.high': 'hex:ff0000'
    }
};
const gradient: WidgetItem = { ...colored, metadata: { ...colored.metadata, valueColorMode: 'gradient' } };
const options = { colorLevel: 'truecolor', colorsDisabled: false, baseColor: 'hex:112233' } as const;

describe('getValueBand', () => {
    it.each([
        [0, 'low'],
        [79.9, 'low'],
        [80, 'mid'],
        [100, 'mid'],
        [100.1, 'high'],
        [Infinity, 'high']
    ])('puts %d%% of the budget in the %s band, red only above it', (percent, band) => {
        expect(getValueBand(base, percent, BUDGET)).toBe(band);
    });

    it.each([
        [69.9, 'low'],
        [70, 'mid'],
        [89.9, 'mid'],
        [90, 'high'],
        [100, 'high']
    ])('puts %d%% used in the %s band, red from the break point', (percent, band) => {
        expect(getValueBand(base, percent, UTILIZATION)).toBe(band);
    });

    it('follows the widget\'s own break points', () => {
        const item = { ...base, metadata: { valueMidFrom: '50', valueHighFrom: '75' } };

        expect(getValueBand(item, 49, BUDGET)).toBe('low');
        expect(getValueBand(item, 50, BUDGET)).toBe('mid');
        expect(getValueBand(item, 75, BUDGET)).toBe('mid');
        expect(getValueBand(item, 76, BUDGET)).toBe('high');
    });
});

describe('value color settings', () => {
    it('defaults to green, yellow and red at the widget\'s break points, in break points mode', () => {
        expect(getBandColor(base, 'low')).toBe('green');
        expect(getBandColor(base, 'mid')).toBe('yellow');
        expect(getBandColor(base, 'high')).toBe('red');
        expect(getBreakPoints(base, BUDGET)).toEqual({ midFrom: 80, highFrom: 100 });
        expect(getValueColorMode(base)).toBe('breakpoints');
        expect(getValueGradient(base)).toBe('traffic');
        expect(isValueColorsEnabled(base)).toBe(false);
    });

    it('stores only what differs from the defaults', () => {
        expect(setValueColorsEnabled(base, true).metadata).toEqual({ valueColors: 'true' });
        expect(setValueColorsEnabled(setValueColorsEnabled(base, true), false).metadata).toBeUndefined();

        expect(setValueColorMode(base, 'gradient').metadata).toEqual({ valueColorMode: 'gradient' });
        expect(setValueColorMode(setValueColorMode(base, 'gradient'), 'breakpoints').metadata).toBeUndefined();

        expect(setBandColor(base, 'mid', 'hex:ff8800').metadata).toEqual({ 'valueColor.mid': 'hex:ff8800' });
        expect(setBandColor(setBandColor(base, 'mid', 'hex:ff8800'), 'mid', 'yellow').metadata).toBeUndefined();

        const thermal = cycleValueGradient(base, 1);
        expect(thermal.metadata).toEqual({ valueGradient: 'thermal' });
        expect(cycleValueGradient(thermal, -1).metadata).toBeUndefined();
        expect(getValueGradient(cycleValueGradient(base, -1))).toBe('mono');
    });

    it('steps a break point by 5 and keeps mid below high', () => {
        const higherMid = stepBreakPoint(base, BUDGET, 'midFrom', 1);
        expect(higherMid.metadata).toEqual({ valueMidFrom: '85' });
        expect(stepBreakPoint(higherMid, BUDGET, 'midFrom', -1).metadata).toBeUndefined();

        const nearHigh = { ...base, metadata: { valueMidFrom: '97' } };
        expect(getBreakPoints(stepBreakPoint(nearHigh, BUDGET, 'midFrom', 1), BUDGET).midFrom).toBe(99);
        expect(getBreakPoints(stepBreakPoint(nearHigh, BUDGET, 'highFrom', -1), BUDGET).highFrom).toBe(98);
    });

    it('takes a typed break point and says what\'s wrong with a bad one', () => {
        expect(typeBreakPoint(base, BUDGET, 'highFrom', '120')).toEqual({ ...base, metadata: { valueHighFrom: '120' } });
        expect(typeBreakPoint({ ...base, metadata: { valueHighFrom: '120' } }, BUDGET, 'highFrom', '100')).toEqual({ ...base, metadata: undefined });

        expect(typeBreakPoint(base, BUDGET, 'midFrom', '7.5')).toBe('Use a whole number from 1 to 999.');
        expect(typeBreakPoint(base, BUDGET, 'midFrom', '0')).toBe('Use a whole number from 1 to 999.');
        expect(typeBreakPoint(base, BUDGET, 'midFrom', '')).toBe('Use a whole number from 1 to 999.');
        expect(typeBreakPoint(base, BUDGET, 'midFrom', '100')).toBe('Mid has to start below high (100%).');
        expect(typeBreakPoint(base, BUDGET, 'highFrom', '80')).toBe('High has to start above mid (80%).');
    });

    it('resets everything but the on/off switch', () => {
        const item = { ...gradient, metadata: { ...gradient.metadata, valueGradient: 'thermal', valueMidFrom: '50', valueHighFrom: '75' } };

        expect(resetValueColors(item).metadata).toEqual({ valueColors: 'true' });
    });
});

describe('getValueColorCode', () => {
    it('uses the band\'s color in break points mode', () => {
        expect(getValueColorCode(colored, 40, BUDGET, 'truecolor')).toBe(LOW);
        expect(getValueColorCode(colored, 100, BUDGET, 'truecolor')).toBe(MID);
        expect(getValueColorCode(colored, 101, BUDGET, 'truecolor')).toBe(HIGH);
    });

    // The gradient reaches its end color where red would start
    it('places the value along the gradient by its share of the high break point', () => {
        expect(getValueColorCode(gradient, 0, BUDGET, 'truecolor')).toBe(gradientPresetCodeAt('traffic', 0));
        expect(getValueColorCode(gradient, 50, BUDGET, 'truecolor')).toBe(gradientPresetCodeAt('traffic', 0.5));
        expect(getValueColorCode(gradient, 45, UTILIZATION, 'truecolor')).toBe(gradientPresetCodeAt('traffic', 0.5));
        expect(getValueColorCode(gradient, 100, BUDGET, 'truecolor')).toBe(gradientPresetCodeAt('traffic', 1));
        expect(getValueColorCode(gradient, 150, BUDGET, 'truecolor')).toBe(gradientPresetCodeAt('traffic', 1));
        expect(getValueColorCode(gradient, Infinity, BUDGET, 'truecolor')).toBe(gradientPresetCodeAt('traffic', 1));
    });

    it('uses the widget\'s gradient preset', () => {
        const thermal = { ...gradient, metadata: { ...gradient.metadata, valueGradient: 'thermal' } };

        expect(getValueColorCode(thermal, 50, BUDGET, 'truecolor')).toBe(gradientPresetCodeAt('thermal', 0.5));
    });

    it('falls back to the break points below truecolor', () => {
        expect(getValueColorCode(gradient, 40, BUDGET, 'ansi256')).toBe(LOW);
        expect(getValueColorCode(gradient, 101, BUDGET, 'ansi16')).toBe(HIGH);
    });
});

describe('getValueColorsModifier', () => {
    it('names the mode, and the gradient in the form the line editor marks as needing truecolor', () => {
        expect(getValueColorsModifier(base)).toBeNull();
        expect(getValueColorsModifier(colored)).toBe('value colors');
        expect(getValueColorsModifier(gradient)).toBe('value gradient: traffic');
        expect(noteGradientNeedsTruecolor('(used, value gradient: traffic)', { ...DEFAULT_SETTINGS, colorLevel: 2 })).toBe('(used, value gradient: traffic, needs truecolor)');
        expect(noteGradientNeedsTruecolor('(used, value gradient: traffic)', { ...DEFAULT_SETTINGS, colorLevel: 3 })).toBe('(used, value gradient: traffic)');
    });
});

describe('formatColoredValue', () => {
    it('renders plain text while value colors are off', () => {
        expect(formatColoredValue(base, 'Spend Today: ', '$40.00', 40, BUDGET, options)).toBe('Spend Today: $40.00');
        expect(formatColoredValue({ ...base, rawValue: true }, 'Spend Today: ', '$40.00', 40, BUDGET, options)).toBe('$40.00');
    });

    it('colors the value and keeps the label in the widget color', () => {
        expect(formatColoredValue(colored, 'Spend Today: ', '$90.00', 90, BUDGET, options)).toBe(`${BASE}Spend Today: ${FG_RESET}${MID}$90.00${FG_RESET}`);
        expect(formatColoredValue({ ...colored, rawValue: true }, 'Spend Today: ', '$90.00', 90, BUDGET, options)).toBe(`${MID}$90.00${FG_RESET}`);
    });

    it('keeps the widget color for a value with nothing to compare it to', () => {
        expect(formatColoredValue({ ...colored, rawValue: true }, 'Spend Today: ', '$90.00', null, BUDGET, options)).toBe(`${BASE}$90.00${FG_RESET}`);
    });

    it('renders plain text when colors are off for the whole status line', () => {
        expect(formatColoredValue(colored, 'Spend Today: ', '$90.00', 90, BUDGET, { ...options, colorsDisabled: true })).toBe('Spend Today: $90.00');
    });
});
