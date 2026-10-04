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
    formatBarWidth,
    getBarWidth,
    getBarWidthKeybinds,
    getBarWidthModifier,
    getDesiredBarCells,
    setBarWidth,
    stepBarWidth
} from '../bar-width';

const item = (barWidth?: string): WidgetItem => ({
    id: 'w',
    type: 'context-bar',
    metadata: barWidth === undefined ? undefined : { barWidth }
});

describe('bar width setting', () => {
    it('reads a percentage, fill, or the default', () => {
        expect(getBarWidth(item())).toBe('default');
        expect(getBarWidth(item('50'))).toBe(50);
        expect(getBarWidth(item('fill'))).toBe('fill');
    });

    it('treats values outside 10-100% as the default', () => {
        expect(getBarWidth(item('5'))).toBe('default');
        expect(getBarWidth(item('101'))).toBe('default');
        expect(getBarWidth(item('wide'))).toBe('default');
        expect(getBarWidth(item('12.5'))).toBe('default');
    });

    it('stores percentages and fill, and drops the key for the default', () => {
        expect(setBarWidth(item(), 40).metadata).toEqual({ barWidth: '40' });
        expect(setBarWidth(item(), 'fill').metadata).toEqual({ barWidth: 'fill' });
        expect(setBarWidth(item('40'), 'default').metadata).toBeUndefined();
    });

    it('steps from the default through 10-100% in fives to fill, stopping at both ends', () => {
        expect(stepBarWidth('default', 1)).toBe(10);
        expect(stepBarWidth(10, 1)).toBe(15);
        expect(stepBarWidth(100, 1)).toBe('fill');
        expect(stepBarWidth('fill', 1)).toBe('fill');
        expect(stepBarWidth('fill', -1)).toBe(100);
        expect(stepBarWidth(10, -1)).toBe('default');
        expect(stepBarWidth('default', -1)).toBe('default');
    });

    it('steps a hand-edited percentage to the neighboring fives', () => {
        expect(stepBarWidth(37, 1)).toBe(40);
        expect(stepBarWidth(37, -1)).toBe(35);
    });

    it('labels the setting for the editor and the line editor', () => {
        expect(formatBarWidth('default')).toBe('default');
        expect(formatBarWidth(45)).toBe('45%');
        expect(formatBarWidth('fill')).toBe('fill');
        expect(getBarWidthModifier(item())).toBeNull();
        expect(getBarWidthModifier(item('45'))).toBe('45% width');
        expect(getBarWidthModifier(item('fill'))).toBe('fill width');
    });

    it('offers (b) only while a bar is shown', () => {
        expect(getBarWidthKeybinds(true)).toEqual([{ key: 'b', label: '(b)ar width', action: EDIT_BAR_WIDTH_ACTION }]);
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
