import {
    describe,
    expect,
    it
} from 'vitest';

import type { WidgetItem } from '../../../types/Widget';
import {
    CYCLE_BAR_NUMBERS_ACTION,
    TOGGLE_BAR_EMPTY_CELLS_ACTION,
    TOGGLE_BAR_NUMBERS_ACTION,
    cycleBarNumbers,
    getBarCellShape,
    getBarEmptyCells,
    getBarEmptyCellsKeybinds,
    getBarLayoutModifiers,
    getBarNumbers,
    getBarNumbersKeybinds,
    getBarStyle,
    keepBarLayout,
    setBarSize,
    setBarStyle,
    showsBarCounts,
    showsBarPercent,
    stepBarStyle,
    toggleBarEmptyCells,
    toggleBarNumbers
} from '../bar-layout';

const item = (metadata?: Record<string, string>): WidgetItem => ({ id: 'w', type: 'session-usage', metadata });

describe('bar style', () => {
    it('reads the style from the display mode', () => {
        expect(getBarStyle(item({ display: 'progress' }))).toBe('block');
        expect(getBarStyle(item({ display: 'progress-short' }))).toBe('block');
        expect(getBarStyle(item({ display: 'slider' }))).toBe('slider');
        expect(getBarStyle(item({ display: 'slider-only' }))).toBe('slider');
        expect(getBarStyle(item({ display: 'cells' }))).toBe('cells');
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

describe('cell styles', () => {
    it('reads the cell shape, the first one unless another is stored', () => {
        expect(getBarCellShape(item({ display: 'cells' }))).toBe('rectangle');
        expect(getBarCellShape(item({ display: 'cells', barCell: 'square' }))).toBe('square');
        expect(getBarCellShape(item({ display: 'cells', barCell: 'seven-eighths' }))).toBe('seven-eighths');
        expect(getBarCellShape(item({ display: 'cells', barCell: 'parallelogram' }))).toBe('parallelogram');
        // A shape this build doesn't know, e.g. from a later one
        expect(getBarCellShape(item({ display: 'cells', barCell: 'hexagon' }))).toBe('rectangle');
    });

    // (p) steps through the styles; null after the last
    it('steps from block to slider to each cell shape, keeping the size and numbers', () => {
        const block = item({ display: 'progress', barNumbers: 'none' });
        const steps = [block];
        for (let next = stepBarStyle(block); next; next = stepBarStyle(next)) {
            steps.push(next);
        }

        expect(steps.map(step => step.metadata)).toEqual([
            { display: 'progress', barNumbers: 'none' },
            { display: 'slider', barWidth: 'long', barNumbers: 'none' },
            { display: 'cells', barWidth: 'long', barNumbers: 'none' },
            { display: 'cells', barWidth: 'long', barNumbers: 'none', barCell: 'square' },
            { display: 'cells', barWidth: 'long', barNumbers: 'none', barCell: 'seven-eighths' },
            { display: 'cells', barWidth: 'long', barNumbers: 'none', barCell: 'parallelogram' }
        ]);
        expect(stepBarStyle(item({ display: 'time' }))).toBeNull();
    });

    // A cell bar has no older display mode that sizes it, so medium, the
    // size a bar takes when nothing else says, stores nothing
    it('stores a cell bar\'s size only when it isn\'t medium', () => {
        expect(setBarStyle(item({ display: 'progress-short' }), 'cells').metadata).toEqual({ display: 'cells' });
        expect(setBarSize(item({ display: 'cells', barCell: 'square' }), 'short').metadata).toEqual({ display: 'cells', barWidth: 'short', barCell: 'square' });
        expect(setBarSize(item({ display: 'cells', barWidth: 'short' }), 'medium').metadata).toEqual({ display: 'cells' });
    });

    it('keeps the shape through size and numbers changes, and drops it with the style', () => {
        const square = item({ display: 'cells', barCell: 'square' });

        expect(toggleBarNumbers(square).metadata).toEqual({ display: 'cells', barCell: 'square', barNumbers: 'none' });
        expect(setBarStyle(square, 'block').metadata).toEqual({ display: 'progress-short' });
        expect(keepBarLayout(square).metadata).toEqual({ display: 'cells', barWidth: 'medium' });
    });

    it('names the shape in the line editor', () => {
        expect(getBarLayoutModifiers(item({ display: 'cells' }))).toEqual(['cells ▮', 'medium']);
        expect(getBarLayoutModifiers(item({ display: 'cells', barCell: 'square', barWidth: 'long' }))).toEqual(['cells ■', 'long']);
        expect(getBarLayoutModifiers(item({ display: 'cells', barCell: 'seven-eighths', barNumbers: 'none' }))).toEqual(['cells ▉', 'medium', 'numbers off']);
        expect(getBarLayoutModifiers(item({ display: 'cells', barCell: 'parallelogram', barWidth: 'fill' }))).toEqual(['cells ▰', 'fill width']);
    });
});

// A cell bar's empty cells are faint unless gray is chosen, stored as barEmpty
describe('cell bar empty cells', () => {
    it('reads faint unless gray is stored', () => {
        expect(getBarEmptyCells(item({ display: 'cells' }))).toBe('faint');
        expect(getBarEmptyCells(item({ display: 'cells', barEmpty: 'gray' }))).toBe('gray');
        // A value this build doesn't know, e.g. from a later one
        expect(getBarEmptyCells(item({ display: 'cells', barEmpty: 'checkered' }))).toBe('faint');
    });

    it('toggles gray on, and back off by removing the key', () => {
        const gray = toggleBarEmptyCells(item({ display: 'cells', barCell: 'square' }));

        expect(gray.metadata).toEqual({ display: 'cells', barCell: 'square', barEmpty: 'gray' });
        expect(toggleBarEmptyCells(gray).metadata).toEqual({ display: 'cells', barCell: 'square' });
        expect(toggleBarEmptyCells(item({ display: 'cells', barEmpty: 'checkered' })).metadata).toEqual({ display: 'cells', barEmpty: 'gray' });
    });

    it('keeps gray from shape to shape and through size and numbers changes', () => {
        const gray = item({ display: 'cells', barEmpty: 'gray' });
        const square = stepBarStyle(gray);

        expect(square?.metadata).toEqual({ display: 'cells', barCell: 'square', barEmpty: 'gray' });
        expect(setBarSize(gray, 'long').metadata).toEqual({ display: 'cells', barWidth: 'long', barEmpty: 'gray' });
        expect(toggleBarNumbers(gray).metadata).toEqual({ display: 'cells', barEmpty: 'gray', barNumbers: 'none' });
    });

    // Another style or the text mode ignores the choice and keeps it, so the
    // next cell bar is gray again
    it('keeps gray through the other styles and the text mode', () => {
        const block = setBarStyle(item({ display: 'cells', barCell: 'parallelogram', barEmpty: 'gray' }), 'block');
        const text = keepBarLayout(item({ display: 'cells', barEmpty: 'gray' }));

        expect(block.metadata).toEqual({ display: 'progress-short', barEmpty: 'gray' });
        expect(getBarLayoutModifiers(block)).toEqual(['block bar', 'medium']);
        expect(setBarStyle(block, 'cells').metadata).toEqual({ display: 'cells', barEmpty: 'gray' });
        expect(text.metadata).toEqual({ display: 'cells', barEmpty: 'gray', barWidth: 'medium' });
    });

    it('names gray after the shape in the line editor, and faint not at all', () => {
        expect(getBarLayoutModifiers(item({ display: 'cells', barEmpty: 'gray', barWidth: 'long' }))).toEqual(['cells ▮', 'gray', 'long']);
        expect(getBarLayoutModifiers(item({ display: 'cells', barCell: 'square', barEmpty: 'gray', barNumbers: 'none' }))).toEqual(['cells ■', 'gray', 'medium', 'numbers off']);
        expect(getBarLayoutModifiers(item({ display: 'cells', barEmpty: 'checkered' }))).toEqual(['cells ▮', 'medium']);
        expect(getBarLayoutModifiers(item({ display: 'slider', barEmpty: 'gray' }))).toEqual(['slider bar', 'short']);
    });

    it('offers (y) only on a cell bar, naming what it switches to', () => {
        expect(getBarEmptyCellsKeybinds(item({ display: 'cells' }))).toEqual([{ key: 'y', label: '(y) gray empty cells', action: TOGGLE_BAR_EMPTY_CELLS_ACTION }]);
        expect(getBarEmptyCellsKeybinds(item({ display: 'cells', barEmpty: 'gray' }))).toEqual([{ key: 'y', label: '(y) faint empty cells', action: TOGGLE_BAR_EMPTY_CELLS_ACTION }]);
        expect(getBarEmptyCellsKeybinds(item({ display: 'progress', barEmpty: 'gray' }))).toEqual([]);
        expect(getBarEmptyCellsKeybinds(item({ display: 'slider' }))).toEqual([]);
        expect(getBarEmptyCellsKeybinds(item({ barEmpty: 'gray' }))).toEqual([]);
        expect(getBarEmptyCellsKeybinds(undefined)).toEqual([]);
    });
});
