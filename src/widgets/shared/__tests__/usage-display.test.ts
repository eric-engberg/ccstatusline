import {
    describe,
    expect,
    it
} from 'vitest';

import type { WidgetItem } from '../../../types/Widget';
import {
    cycleUsageDisplayMode,
    makeSliderBar
} from '../usage-display';

describe('makeSliderBar', () => {
    it('renders fully empty bar at 0%', () => {
        expect(makeSliderBar(0)).toBe('░░░░░░░░░░');
    });

    it('renders fully filled bar at 100%', () => {
        expect(makeSliderBar(100)).toBe('▓▓▓▓▓▓▓▓▓▓');
    });

    it('renders half-filled bar at 50%', () => {
        expect(makeSliderBar(50)).toBe('▓▓▓▓▓░░░░░');
    });

    it('clamps values below 0', () => {
        expect(makeSliderBar(-10)).toBe('░░░░░░░░░░');
    });

    it('clamps values above 100', () => {
        expect(makeSliderBar(150)).toBe('▓▓▓▓▓▓▓▓▓▓');
    });

    it('accepts custom width', () => {
        expect(makeSliderBar(50, 6)).toBe('▓▓▓░░░');
    });

    it('renders a time cursor when cursorPercent is provided', () => {
        expect(makeSliderBar(50, 10, { cursorPercent: 50 })).toBe('▓▓▓▓▓│░░░░');
    });

    it('clamps slider cursor percent', () => {
        expect(makeSliderBar(50, 10, { cursorPercent: -10 })).toBe('│▓▓▓▓░░░░░');
        expect(makeSliderBar(50, 10, { cursorPercent: 150 })).toBe('▓▓▓▓▓░░░░│');
    });
});

describe('cycleUsageDisplayMode with slider', () => {
    const base: WidgetItem = { id: 'test', type: 'session-usage' };

    it('cycles the text, a block bar and a slider when includeSlider is true', () => {
        const first = cycleUsageDisplayMode(base, [], true);
        const second = cycleUsageDisplayMode(first, [], true);
        const third = cycleUsageDisplayMode(second, [], true);

        expect(first.metadata?.display).toBe('progress');
        expect(second.metadata?.display).toBe('slider');
        expect(third.metadata?.display).toBe('time');
    });

    it('skips the slider when includeSlider is false', () => {
        const first = cycleUsageDisplayMode(base);
        const second = cycleUsageDisplayMode(first);

        expect(first.metadata?.display).toBe('progress');
        expect(second.metadata?.display).toBe('time');
    });

    // The size belongs to (b): switching style keeps it, and so does the text mode
    it('keeps the bar\'s size through the styles and back from the text', () => {
        const medium: WidgetItem = { ...base, metadata: { display: 'progress-short' } };
        const slider = cycleUsageDisplayMode(medium, [], true);
        const text = cycleUsageDisplayMode(slider, [], true);
        const block = cycleUsageDisplayMode(text, [], true);

        expect(slider.metadata).toEqual({ display: 'slider', barWidth: 'medium' });
        expect(text.metadata).toEqual({ display: 'time', barWidth: 'medium' });
        expect(block.metadata).toEqual({ display: 'progress-short' });
    });

    it('keeps a short bar only setting\'s size and numbers through the text', () => {
        const text = cycleUsageDisplayMode({ ...base, metadata: { display: 'slider-only' } }, [], true);
        expect(text.metadata).toEqual({ display: 'time', barWidth: 'short', barOnly: 'true' });
        expect(cycleUsageDisplayMode(text, [], true).metadata).toEqual({ display: 'progress-short', barWidth: 'short', barOnly: 'true' });
        expect(cycleUsageDisplayMode({ ...base, metadata: { display: 'time', barOnly: 'true' } }, [], true).metadata).toEqual({ display: 'progress', barOnly: 'true' });
    });

    it('keeps cursor metadata through the bar styles and clears it when returning to time mode', () => {
        const cursorBase: WidgetItem = {
            ...base,
            metadata: { cursor: 'true' }
        };
        const first = cycleUsageDisplayMode(cursorBase, [], true);
        const second = cycleUsageDisplayMode(first, [], true);
        const third = cycleUsageDisplayMode(second, [], true);

        expect(first.metadata?.cursor).toBe('true');
        expect(second.metadata?.cursor).toBe('true');
        expect(third.metadata?.cursor).toBeUndefined();
    });
});
