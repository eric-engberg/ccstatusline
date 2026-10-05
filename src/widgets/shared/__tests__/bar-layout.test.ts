import {
    describe,
    expect,
    it
} from 'vitest';

import type { WidgetItem } from '../../../types/Widget';
import {
    TOGGLE_BAR_NUMBERS_ACTION,
    areBarNumbersShown,
    getBarLayoutModifiers,
    getBarNumbersKeybinds,
    getBarStyle,
    keepBarLayout,
    setBarSize,
    setBarStyle,
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
        expect(keepBarLayout(item({ display: 'slider-only' })).metadata).toEqual({ display: 'slider-only', barWidth: 'short', barOnly: 'true' });
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
    it('shows the numbers unless turned off, as the short bar only mode always did', () => {
        expect(areBarNumbersShown(item({ display: 'progress' }))).toBe(true);
        expect(areBarNumbersShown(item({ display: 'progress', barOnly: 'true' }))).toBe(false);
        expect(areBarNumbersShown(item({ display: 'slider-only' }))).toBe(false);
    });

    it('toggles the numbers off and back on', () => {
        const off = toggleBarNumbers(item({ display: 'progress' }));
        expect(off.metadata).toEqual({ display: 'progress', barOnly: 'true' });
        expect(toggleBarNumbers(off).metadata).toEqual({ display: 'progress' });
    });

    // The short bar only mode becomes a slider with its numbers off once edited
    it('turns a short bar only setting into a slider without numbers', () => {
        expect(toggleBarNumbers(item({ display: 'slider-only' })).metadata).toEqual({ display: 'slider' });
        expect(setBarSize(item({ display: 'slider-only' }), 'long').metadata).toEqual({ display: 'slider', barWidth: 'long', barOnly: 'true' });
        expect(setBarStyle(item({ display: 'slider-only' }), 'block').metadata).toEqual({ display: 'progress-short', barWidth: 'short', barOnly: 'true' });
    });

    it('offers (n) only while a bar is shown, named for what it does next', () => {
        expect(getBarNumbersKeybinds(item({ display: 'progress' }), true)).toEqual([{ key: 'n', label: '(n) hide numbers', action: TOGGLE_BAR_NUMBERS_ACTION }]);
        expect(getBarNumbersKeybinds(item({ display: 'slider-only' }), true)).toEqual([{ key: 'n', label: '(n) show numbers', action: TOGGLE_BAR_NUMBERS_ACTION }]);
        expect(getBarNumbersKeybinds(item(), false)).toEqual([]);
    });
});

describe('getBarLayoutModifiers', () => {
    it('names the style, the size, and numbers that are off', () => {
        expect(getBarLayoutModifiers(item({ display: 'progress' }))).toEqual(['block bar', 'long']);
        expect(getBarLayoutModifiers(item({ display: 'slider-only' }))).toEqual(['slider bar', 'short', 'numbers off']);
        expect(getBarLayoutModifiers(item({ display: 'progress-short', barWidth: '20', barOnly: 'true' }))).toEqual(['block bar', '20% width', 'numbers off']);
        expect(getBarLayoutModifiers(item())).toEqual([]);
    });
});
