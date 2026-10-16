import {
    describe,
    expect,
    it
} from 'vitest';

import type { WidgetItem } from '../../../types/Widget';
import {
    CYCLE_BAR_NUMBERS_ACTION,
    TOGGLE_BAR_NUMBERS_ACTION,
    cycleBarNumbers,
    getBarLayoutModifiers,
    getBarNumbers,
    getBarNumbersKeybinds,
    getBarStyle,
    keepBarLayout,
    setBarSize,
    setBarStyle,
    showsBarCounts,
    showsBarPercent,
    toggleBarNumbers
} from '../bar-layout';

const item = (metadata?: Record<string, string>): WidgetItem => ({ id: 'w', type: 'session-usage', metadata });

describe('bar style', () => {
    it('reads the style from the display mode', () => {
        expect(getBarStyle(item({ display: 'progress' }))).toBe('block');
        expect(getBarStyle(item({ display: 'progress-short' }))).toBe('block');
        expect(getBarStyle(item({ display: 'slider' }))).toBe('slider');
        expect(getBarStyle(item({ display: 'slider-only' }))).toBe('slider');
        expect(getBarStyle(item({ display: 'time' }))).toBeNull();
        expect(getBarStyle(item())).toBeNull();
    });

    // A long block bar stays long as a slider, and a medium one stays medium
    it('keeps the size when the style changes', () => {
        expect(setBarStyle(item({ display: 'progress' }), 'slider').metadata).toEqual({ display: 'slider', barWidth: 'long' });
        expect(setBarStyle(item({ display: 'progress-short' }), 'slider').metadata).toEqual({ display: 'slider', barWidth: 'medium' });
        expect(setBarStyle(item({ display: 'slider' }), 'block').metadata).toEqual({ display: 'progress-short', barWidth: 'short' });
        expect(setBarStyle(item({ display: 'slider', barWidth: 'long' }), 'block').metadata).toEqual({ display: 'progress' });
        expect(setBarStyle(item({ display: 'slider', barWidth: '40' }), 'block').metadata).toEqual({ display: 'progress-short', barWidth: '40' });
    });

    it('starts a bar from the text mode at the size it had, or the one given', () => {
        expect(setBarStyle(item({ display: 'time' }), 'block', 'long').metadata).toEqual({ display: 'progress' });
        expect(setBarStyle(item(), 'slider', 'short').metadata).toEqual({ display: 'slider' });
        expect(setBarStyle(item({ display: 'time', barWidth: 'medium' }), 'block', 'long').metadata).toEqual({ display: 'progress-short' });
    });
});

describe('keepBarLayout', () => {
    // So (p) brings the bar back as it was
    it('stores the size and numbers setting for the text mode to keep', () => {
        expect(keepBarLayout(item({ display: 'slider' })).metadata).toEqual({ display: 'slider', barWidth: 'short' });
        expect(keepBarLayout(item({ display: 'slider-only' })).metadata).toEqual({ display: 'slider-only', barWidth: 'short', barNumbers: 'none' });
        expect(keepBarLayout(item({ display: 'progress', barNumbers: 'counts' })).metadata).toEqual({ display: 'progress', barWidth: 'long', barNumbers: 'counts' });
        expect(keepBarLayout(item({ display: 'progress', barWidth: '40' })).metadata).toEqual({ display: 'progress', barWidth: '40' });
    });
});

describe('bar size', () => {
    // Long and medium block bars store the display modes that have always meant them
    it('stores a size only where the display mode doesn\'t already mean it', () => {
        expect(setBarSize(item({ display: 'progress-short' }), 'long').metadata).toEqual({ display: 'progress' });
        expect(setBarSize(item({ display: 'progress' }), 'medium').metadata).toEqual({ display: 'progress-short' });
        expect(setBarSize(item({ display: 'progress' }), 'short').metadata).toEqual({ display: 'progress-short', barWidth: 'short' });
        expect(setBarSize(item({ display: 'slider' }), 'long').metadata).toEqual({ display: 'slider', barWidth: 'long' });
        expect(setBarSize(item({ display: 'slider', barWidth: 'long' }), 'short').metadata).toEqual({ display: 'slider' });
    });

    // On a line of unknown width it falls back to the display mode's size
    it('keeps a block bar\'s display mode for a size relative to the line', () => {
        expect(setBarSize(item({ display: 'progress' }), 'fill').metadata).toEqual({ display: 'progress', barWidth: 'fill' });
        expect(setBarSize(item({ display: 'progress-short' }), 30).metadata).toEqual({ display: 'progress-short', barWidth: '30' });
    });

    it('keeps the other settings', () => {
        expect(setBarSize(item({ display: 'slider', invert: 'true', gradient: 'thermal' }), 20).metadata)
            .toEqual({ display: 'slider', invert: 'true', gradient: 'thermal', barWidth: '20' });
    });
});

describe('bar numbers', () => {
    it('shows all the numbers unless some are turned off, as the short bar only mode always did', () => {
        expect(getBarNumbers(item({ display: 'progress' }))).toBe('all');
        expect(getBarNumbers(item({ display: 'progress', barNumbers: 'percent' }))).toBe('percent');
        expect(getBarNumbers(item({ display: 'progress', barNumbers: 'counts' }))).toBe('counts');
        expect(getBarNumbers(item({ display: 'progress', barNumbers: 'none' }))).toBe('none');
        expect(getBarNumbers(item({ display: 'slider-only' }))).toBe('none');
        expect(getBarNumbers(item({ display: 'progress', barNumbers: 'loud' }))).toBe('all');
    });

    // barOnly was the setting's first name, saved by early builds of the fork
    it('reads the earlier barOnly flag as no numbers', () => {
        expect(getBarNumbers(item({ display: 'progress', barOnly: 'true' }))).toBe('none');
    });

    it('says which numbers show', () => {
        expect([showsBarPercent(item({ display: 'slider' })), showsBarCounts(item({ display: 'slider' }))]).toEqual([true, true]);
        expect([showsBarPercent(item({ barNumbers: 'percent' })), showsBarCounts(item({ barNumbers: 'percent' }))]).toEqual([true, false]);
        expect([showsBarPercent(item({ barNumbers: 'counts' })), showsBarCounts(item({ barNumbers: 'counts' }))]).toEqual([false, true]);
        expect([showsBarPercent(item({ barNumbers: 'none' })), showsBarCounts(item({ barNumbers: 'none' }))]).toEqual([false, false]);
    });

    // For bars with only a percent after them
    it('toggles the numbers off and back on', () => {
        const off = toggleBarNumbers(item({ display: 'progress' }));
        expect(off.metadata).toEqual({ display: 'progress', barNumbers: 'none' });
        expect(toggleBarNumbers(off).metadata).toEqual({ display: 'progress' });
        expect(toggleBarNumbers(item({ display: 'progress', barOnly: 'true' })).metadata).toEqual({ display: 'progress' });
    });

    // For the Context Bar's token counts and percent
    it('cycles both numbers, the percent only, the counts only, and none', () => {
        const percent = cycleBarNumbers(item({ display: 'progress-short' }));
        const counts = cycleBarNumbers(percent);
        const none = cycleBarNumbers(counts);
        expect(percent.metadata).toEqual({ display: 'progress-short', barNumbers: 'percent' });
        expect(counts.metadata).toEqual({ display: 'progress-short', barNumbers: 'counts' });
        expect(none.metadata).toEqual({ display: 'progress-short', barNumbers: 'none' });
        expect(cycleBarNumbers(none).metadata).toEqual({ display: 'progress-short' });
    });

    // The short bar only mode becomes a slider with its numbers off once edited
    it('turns a short bar only setting into a slider without numbers', () => {
        expect(toggleBarNumbers(item({ display: 'slider-only' })).metadata).toEqual({ display: 'slider' });
        expect(setBarSize(item({ display: 'slider-only' }), 'long').metadata).toEqual({ display: 'slider', barWidth: 'long', barNumbers: 'none' });
        expect(setBarStyle(item({ display: 'slider-only' }), 'block').metadata).toEqual({ display: 'progress-short', barWidth: 'short', barNumbers: 'none' });
    });

    it('offers (n) only while a bar is shown, as a toggle or, with counts, a cycle', () => {
        expect(getBarNumbersKeybinds(item({ display: 'progress' }), true)).toEqual([{ key: 'n', label: '(n) hide numbers', action: TOGGLE_BAR_NUMBERS_ACTION }]);
        expect(getBarNumbersKeybinds(item({ display: 'slider-only' }), true)).toEqual([{ key: 'n', label: '(n) show numbers', action: TOGGLE_BAR_NUMBERS_ACTION }]);
        expect(getBarNumbersKeybinds(item({ display: 'slider' }), true, true)).toEqual([{ key: 'n', label: '(n)umbers', action: CYCLE_BAR_NUMBERS_ACTION }]);
        expect(getBarNumbersKeybinds(item(), false)).toEqual([]);
    });
});

describe('getBarLayoutModifiers', () => {
    it('names the style, the size, and numbers that are off', () => {
        expect(getBarLayoutModifiers(item({ display: 'progress' }))).toEqual(['block bar', 'long']);
        expect(getBarLayoutModifiers(item({ display: 'slider-only' }))).toEqual(['slider bar', 'short', 'numbers off']);
        expect(getBarLayoutModifiers(item({ display: 'progress-short', barWidth: '20', barNumbers: 'none' }))).toEqual(['block bar', '20% width', 'numbers off']);
        expect(getBarLayoutModifiers(item({ display: 'progress', barNumbers: 'percent' }))).toEqual(['block bar', 'long', '% only']);
        expect(getBarLayoutModifiers(item({ display: 'slider', barNumbers: 'counts' }))).toEqual(['slider bar', 'short', 'counts only']);
        expect(getBarLayoutModifiers(item())).toEqual([]);
    });
});
