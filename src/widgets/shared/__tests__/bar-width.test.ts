import {
    describe,
    expect,
    it
} from 'vitest';

import type { WidgetItem } from '../../../types/Widget';
import {
    EDIT_BAR_WIDTH_ACTION,
    MIN_BAR_CELLS,
    allocateBarCells,
    formatBarSize,
    getBarSize,
    getBarSizeModifier,
    getBarWidthKeybinds,
    getDesiredBarCells,
    getFixedBarCells,
    getLineBarWidth,
    getStoredBarSize,
    stepBarSize
} from '../bar-width';

const item = (barWidth?: string, display?: string): WidgetItem => ({
    id: 'w',
    type: 'context-bar',
    metadata: {
        ...(barWidth === undefined ? {} : { barWidth }),
        ...(display === undefined ? {} : { display })
    }
});

describe('bar size setting', () => {
    it('reads a named size, a percentage or fill', () => {
        expect(getBarSize(item('short'))).toBe('short');
        expect(getBarSize(item('long'))).toBe('long');
        expect(getBarSize(item('50'))).toBe(50);
        expect(getBarSize(item('fill'))).toBe('fill');
    });

    // Saved configs from before sizes keep the size their display mode meant
    it('falls back to the size the display mode implies', () => {
        expect(getBarSize(item())).toBe('medium');
        expect(getBarSize(item(undefined, 'progress'))).toBe('long');
        expect(getBarSize(item(undefined, 'progress-short'))).toBe('medium');
        expect(getBarSize(item(undefined, 'slider'))).toBe('short');
        expect(getBarSize(item(undefined, 'slider-only'))).toBe('short');
        expect(getStoredBarSize(item(undefined, 'progress'))).toBeNull();
    });

    it('ignores values that are no size', () => {
        expect(getBarSize(item('5', 'progress'))).toBe('long');
        expect(getBarSize(item('101', 'progress'))).toBe('long');
        expect(getBarSize(item('wide', 'slider'))).toBe('short');
        expect(getBarSize(item('12.5', 'slider'))).toBe('short');
    });

    it('sizes named bars in fixed cells, and leaves only percentages and fill to the line', () => {
        expect(getFixedBarCells(item('short', 'progress'))).toBe(10);
        expect(getFixedBarCells(item('medium', 'slider'))).toBe(16);
        expect(getFixedBarCells(item(undefined, 'progress'))).toBe(32);
        expect(getLineBarWidth(item('short'))).toBeNull();
        expect(getLineBarWidth(item('40'))).toBe(40);
        expect(getLineBarWidth(item('fill'))).toBe('fill');
    });

    // When the line's width is unknown, a percentage or fill bar can't be sized
    it('falls back to the display mode\'s cells for a bar sized to the line', () => {
        expect(getFixedBarCells(item('40', 'progress'))).toBe(32);
        expect(getFixedBarCells(item('fill', 'slider'))).toBe(10);
    });

    it('steps from short through medium, long and 10-100% in fives to fill, stopping at both ends', () => {
        expect(stepBarSize('short', -1)).toBe('short');
        expect(stepBarSize('short', 1)).toBe('medium');
        expect(stepBarSize('medium', 1)).toBe('long');
        expect(stepBarSize('long', 1)).toBe(10);
        expect(stepBarSize(10, 1)).toBe(15);
        expect(stepBarSize(100, 1)).toBe('fill');
        expect(stepBarSize('fill', 1)).toBe('fill');
        expect(stepBarSize('fill', -1)).toBe(100);
        expect(stepBarSize(10, -1)).toBe('long');
        expect(stepBarSize('medium', -1)).toBe('short');
    });

    it('steps a hand-edited percentage to the neighboring fives', () => {
        expect(stepBarSize(37, 1)).toBe(40);
        expect(stepBarSize(37, -1)).toBe(35);
    });

    it('labels the setting for the editor and the line editor', () => {
        expect(formatBarSize('medium')).toBe('medium');
        expect(formatBarSize(45)).toBe('45%');
        expect(formatBarSize('fill')).toBe('fill');
        expect(getBarSizeModifier(item(undefined, 'progress'))).toBe('long');
        expect(getBarSizeModifier(item('45'))).toBe('45% width');
        expect(getBarSizeModifier(item('fill'))).toBe('fill width');
    });

    it('offers (b) only while a bar is shown', () => {
        expect(getBarWidthKeybinds(true)).toEqual([{ key: 'b', label: '(b)ar size', action: EDIT_BAR_WIDTH_ACTION }]);
        expect(getBarWidthKeybinds(false)).toEqual([]);
    });
});

describe('bar sizing', () => {
    it('asks for a share of the line width, but never less than the minimum', () => {
        expect(getDesiredBarCells(50, 120)).toBe(60);
        expect(getDesiredBarCells(10, 30)).toBe(MIN_BAR_CELLS);
        expect(getDesiredBarCells('fill', 120)).toBe(Number.POSITIVE_INFINITY);
    });

    it('grows each bar to what it asks for when there is room', () => {
        expect(allocateBarCells([20, 30], 100)).toEqual([20, 30]);
    });

    it('gives fill bars an even split of the room left over', () => {
        expect(allocateBarCells([Number.POSITIVE_INFINITY], 40)).toEqual([MIN_BAR_CELLS + 40]);
        expect(allocateBarCells([15, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY], 31)).toEqual([15, 15, 16]);
    });

    it('shrinks percentage bars in proportion when the line is too long for them', () => {
        // Asking for 15 and 35 cells: 10 and 30 above the minimum, with 20 to share
        expect(allocateBarCells([15, 35], 20)).toEqual([10, 20]);
    });

    it('hands out every leftover cell when the shares do not divide evenly', () => {
        const cells = allocateBarCells([15, 15, 15], 10);
        expect(cells.reduce((sum, value) => sum + value, 0)).toBe(3 * MIN_BAR_CELLS + 10);
    });

    it('keeps bars at the minimum when there is no room', () => {
        expect(allocateBarCells([40, Number.POSITIVE_INFINITY], 0)).toEqual([MIN_BAR_CELLS, MIN_BAR_CELLS]);
        expect(allocateBarCells([40], -12)).toEqual([MIN_BAR_CELLS]);
    });
});
