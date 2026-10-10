import {
    describe,
    expect,
    it
} from 'vitest';

import {
    COUNT_UNIT,
    DOLLARS_PER_HOUR_UNIT,
    DOLLAR_UNIT,
    PERCENT_UNIT,
    floorToUnit,
    makeTokenUnit,
    parseUnitValue,
    roundToUnit
} from '../value-units';

const TOKEN_UNIT = makeTokenUnit(10000);

describe('value units', () => {
    it('shows each unit\'s values the way its widget does', () => {
        expect(PERCENT_UNIT.format(70)).toBe('70%');
        expect(DOLLAR_UNIT.format(5)).toBe('$5');
        expect(DOLLAR_UNIT.format(2.5)).toBe('$2.50');
        expect(DOLLARS_PER_HOUR_UNIT.format(15)).toBe('$15/hr');
        expect(DOLLARS_PER_HOUR_UNIT.format(0.75)).toBe('$0.75/hr');
        expect(TOKEN_UNIT.format(500)).toBe('500');
        expect(TOKEN_UNIT.format(12500)).toBe('12.5k');
        expect(TOKEN_UNIT.format(100000)).toBe('100k');
        expect(TOKEN_UNIT.format(1500000)).toBe('1.5M');
        expect(TOKEN_UNIT.format(2000000000)).toBe('2000M');
        expect(COUNT_UNIT.format(3)).toBe('3');
    });

    it('reads typed percents and counts as whole numbers', () => {
        expect(parseUnitValue(PERCENT_UNIT, ' 85 ')).toBe(85);
        expect(parseUnitValue(PERCENT_UNIT, '7.5')).toBeNull();
        expect(parseUnitValue(PERCENT_UNIT, '0')).toBeNull();
        expect(parseUnitValue(PERCENT_UNIT, '1000')).toBeNull();
        expect(parseUnitValue(COUNT_UNIT, '2')).toBe(2);
        expect(parseUnitValue(COUNT_UNIT, '')).toBeNull();
    });

    it('reads typed dollars with or without the sign, to the cent', () => {
        expect(parseUnitValue(DOLLAR_UNIT, '5')).toBe(5);
        expect(parseUnitValue(DOLLAR_UNIT, '$2.50')).toBe(2.5);
        expect(parseUnitValue(DOLLARS_PER_HOUR_UNIT, '0.75')).toBe(0.75);
        expect(parseUnitValue(DOLLAR_UNIT, '2.555')).toBeNull();
        expect(parseUnitValue(DOLLAR_UNIT, '0')).toBeNull();
        expect(parseUnitValue(DOLLAR_UNIT, 'five')).toBeNull();
    });

    it('reads typed tokens in full or with k and M', () => {
        expect(parseUnitValue(TOKEN_UNIT, '250000')).toBe(250000);
        expect(parseUnitValue(TOKEN_UNIT, '250k')).toBe(250000);
        expect(parseUnitValue(TOKEN_UNIT, '1.5M')).toBe(1500000);
        expect(parseUnitValue(TOKEN_UNIT, '2.5m')).toBe(2500000);
        // 1.005 * 1000 is 1004.9999999999999 in floating point
        expect(parseUnitValue(TOKEN_UNIT, '1.005k')).toBe(1005);
        expect(parseUnitValue(TOKEN_UNIT, '0.0001k')).toBeNull();
        expect(parseUnitValue(TOKEN_UNIT, '1.5G')).toBeNull();
    });

    it('rounds to the unit\'s decimal places, or down to them', () => {
        expect(roundToUnit(COUNT_UNIT, 0.5)).toBe(1);
        expect(floorToUnit(COUNT_UNIT, 0.5)).toBe(0);
        expect(roundToUnit(DOLLAR_UNIT, 2.555)).toBe(2.56);
        expect(floorToUnit(DOLLAR_UNIT, 2.555)).toBe(2.55);
    });

    it('steps tokens by the step it was made with', () => {
        expect(makeTokenUnit(5000000).step).toBe(5000000);
    });
});
