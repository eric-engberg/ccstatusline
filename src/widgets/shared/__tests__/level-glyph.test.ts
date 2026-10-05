import {
    describe,
    expect,
    it
} from 'vitest';

import type { WidgetItem } from '../../../types/Widget';
import {
    EDIT_LEVELS_ACTION,
    getLevel,
    getLevelBreakPoints,
    getLevelGlyph,
    getLevelGlyphKeybinds,
    getLevelGlyphSlots,
    isLevelGlyphMode,
    stepLevelBreakPoint,
    typeLevelBreakPoint
} from '../level-glyph';
import { SYMBOL_OVERRIDE_ACTION } from '../symbol-override';

const item = (metadata?: Record<string, string>): WidgetItem => ({ id: 'w', type: 'context-percentage', metadata: { display: 'glyph', ...metadata } });

describe('level glyph', () => {
    it('is the glyph display mode', () => {
        expect(isLevelGlyphMode(item())).toBe(true);
        expect(isLevelGlyphMode({ id: 'w', type: 'context-percentage', metadata: { display: 'slider' } })).toBe(false);
        expect(isLevelGlyphMode({ id: 'w', type: 'context-percentage' })).toBe(false);
    });

    it.each([
        [0, 'low', '🟢'],
        [19.9, 'low', '🟢'],
        [20, 'medium', '⚡'],
        [69.9, 'medium', '⚡'],
        [70, 'high', '🔥'],
        [89.9, 'high', '🔥'],
        [90, 'critical', '🚨'],
        [100, 'critical', '🚨']
    ])('shows %d%% used as the %s glyph', (percent, level, glyph) => {
        expect(getLevel(item(), percent)).toBe(level);
        expect(getLevelGlyph(item(), percent)).toBe(glyph);
    });

    it('follows the widget\'s own glyphs and break points', () => {
        const custom = item({ levelGlyphHigh: '★', levelFromHigh: '50', levelFromCritical: '95' });

        expect(getLevelBreakPoints(custom)).toEqual({ medium: 20, high: 50, critical: 95 });
        expect(getLevelGlyph(custom, 60)).toBe('★');
        expect(getLevelGlyph(custom, 92)).toBe('★');
        expect(getLevelGlyph(custom, 95)).toBe('🚨');
    });

    it('ignores break points that are out of range or out of order', () => {
        expect(getLevelBreakPoints(item({ levelFromMedium: '0' }))).toEqual({ medium: 20, high: 70, critical: 90 });
        expect(getLevelBreakPoints(item({ levelFromHigh: '95' }))).toEqual({ medium: 20, high: 70, critical: 90 });
        expect(getLevelBreakPoints(item({ levelFromCritical: 'soon' }))).toEqual({ medium: 20, high: 70, critical: 90 });
    });

    it('labels each glyph slot with its range', () => {
        expect(getLevelGlyphSlots(item({ levelFromHigh: '60' }))).toEqual([
            { id: 'levelGlyphLow', label: 'Low (under 20%)', defaultSymbol: '🟢' },
            { id: 'levelGlyphMedium', label: 'Medium (20-59%)', defaultSymbol: '⚡' },
            { id: 'levelGlyphHigh', label: 'High (60-89%)', defaultSymbol: '🔥' },
            { id: 'levelGlyphCritical', label: 'Critical (90% and up)', defaultSymbol: '🚨' }
        ]);
    });

    it('steps a break point by 5, keeps the order and stores only changes', () => {
        const higher = stepLevelBreakPoint(item(), 'high', 1);
        expect(higher.metadata).toEqual({ display: 'glyph', levelFromHigh: '75' });
        expect(stepLevelBreakPoint(higher, 'high', -1).metadata).toEqual({ display: 'glyph' });
        expect(getLevelBreakPoints(stepLevelBreakPoint(item({ levelFromHigh: '88' }), 'high', 1)).high).toBe(89);
        expect(getLevelBreakPoints(stepLevelBreakPoint(item({ levelFromMedium: '3' }), 'medium', -1)).medium).toBe(1);
        expect(getLevelBreakPoints(stepLevelBreakPoint(item({ levelFromCritical: '98' }), 'critical', 1)).critical).toBe(100);
    });

    it('takes a typed break point and says what\'s wrong with a bad one', () => {
        expect(typeLevelBreakPoint(item(), 'critical', '95')).toEqual(item({ levelFromCritical: '95' }));
        expect(typeLevelBreakPoint(item(), 'medium', '0')).toBe('Use a whole number from 1 to 100.');
        expect(typeLevelBreakPoint(item(), 'medium', '7.5')).toBe('Use a whole number from 1 to 100.');
        expect(typeLevelBreakPoint(item(), 'medium', '70')).toBe('Medium has to start below High (70%).');
        expect(typeLevelBreakPoint(item(), 'critical', '70')).toBe('Critical has to start above High (70%).');
    });

    it('offers (g) for the glyphs and (l) for the break points', () => {
        expect(getLevelGlyphKeybinds()).toEqual([
            { key: 'g', label: '(g)lyphs', action: SYMBOL_OVERRIDE_ACTION },
            { key: 'l', label: '(l)evels', action: EDIT_LEVELS_ACTION }
        ]);
    });
});
