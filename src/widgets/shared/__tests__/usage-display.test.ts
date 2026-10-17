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

    // The display modes (p) steps through, from the text mode
    const cycle = (item: WidgetItem, presses: number, includeGlyph = false): (string | undefined)[] => {
        const seen: (string | undefined)[] = [];
        let current = item;
        for (let i = 0; i < presses; i++) {
            current = cycleUsageDisplayMode(current, [], true, false, includeGlyph);
            seen.push(current.metadata?.barCell ? `${current.metadata.display}:${current.metadata.barCell}` : current.metadata?.display);
        }
        return seen;
    };

    it('cycles the text, a block bar, a slider and the four cell styles when includeSlider is true', () => {
        expect(cycle(base, 8)).toEqual(['progress', 'slider', 'cells', 'cells:square', 'cells:seven-eighths', 'cells:parallelogram', 'time', 'progress']);
    });

    it('puts the level glyph after the cell styles', () => {
        expect(cycle(base, 8, true)).toEqual(['progress', 'slider', 'cells', 'cells:square', 'cells:seven-eighths', 'cells:parallelogram', 'glyph', 'time']);
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
        const cells = cycleUsageDisplayMode(slider, [], true);
        const lastCells: WidgetItem = { ...base, metadata: { display: 'cells', barCell: 'parallelogram' } };
        const text = cycleUsageDisplayMode(lastCells, [], true);
        const block = cycleUsageDisplayMode(text, [], true);

        expect(slider.metadata).toEqual({ display: 'slider', barWidth: 'medium' });
        expect(cells.metadata).toEqual({ display: 'cells' });
        expect(text.metadata).toEqual({ display: 'time', barWidth: 'medium' });
        expect(block.metadata).toEqual({ display: 'progress-short' });
    });

    it('keeps a short bar only setting\'s size and numbers through the cell styles and the text', () => {
        const cells = cycleUsageDisplayMode({ ...base, metadata: { display: 'slider-only' } }, [], true);
        expect(cells.metadata).toEqual({ display: 'cells', barWidth: 'short', barNumbers: 'none' });
        const text = cycleUsageDisplayMode({ ...cells, metadata: { ...cells.metadata, barCell: 'parallelogram' } }, [], true);
        expect(text.metadata).toEqual({ display: 'time', barWidth: 'short', barNumbers: 'none' });
        expect(cycleUsageDisplayMode(text, [], true).metadata).toEqual({ display: 'progress-short', barWidth: 'short', barNumbers: 'none' });
        expect(cycleUsageDisplayMode({ ...base, metadata: { display: 'time', barNumbers: 'none' } }, [], true).metadata).toEqual({ display: 'progress', barNumbers: 'none' });
    });

    it('keeps cursor metadata through the bar styles and clears it when returning to time mode', () => {
        const cursorBase: WidgetItem = {
            ...base,
            metadata: { cursor: 'true' }
        };
        const steps: WidgetItem[] = [];
        let current = cursorBase;
        for (let i = 0; i < 7; i++) {
            current = cycleUsageDisplayMode(current, [], true);
            steps.push(current);
        }

        expect(steps.slice(0, 6).map(step => step.metadata?.cursor)).toEqual(['true', 'true', 'true', 'true', 'true', 'true']);
        expect(steps[6]?.metadata?.display).toBe('time');
        expect(steps[6]?.metadata?.cursor).toBeUndefined();
    });
});
