import {
    describe,
    expect,
    it
} from 'vitest';

import {
    DEFAULT_SETTINGS,
    type Settings
} from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import {
    drawsWidgetBackgrounds,
    getAutoAlignLines,
    getLineRenderItems,
    getLineSettings,
    isAnyLinePowerline,
    isEveryLinePowerline,
    isPowerlineLine,
    moveLinePowerline,
    removeLinePowerline,
    toggleLinePowerline
} from '../powerline-lines';

function withPowerline(enabled: boolean, lineEnabled?: (boolean | null)[]): Settings {
    return {
        ...DEFAULT_SETTINGS,
        lines: [[{ id: 'a', type: 'model' }], [{ id: 'b', type: 'model' }], [{ id: 'c', type: 'model' }]],
        powerline: { ...DEFAULT_SETTINGS.powerline, enabled, lineEnabled }
    };
}

describe('isPowerlineLine', () => {
    it('follows the global switch for a line without its own setting', () => {
        expect(isPowerlineLine(withPowerline(true), 1)).toBe(true);
        expect(isPowerlineLine(withPowerline(false), 1)).toBe(false);
        expect(isPowerlineLine(withPowerline(true, [null, null]), 1)).toBe(true);
    });

    it('uses a line\'s own setting either way', () => {
        expect(isPowerlineLine(withPowerline(true, [null, false]), 1)).toBe(false);
        expect(isPowerlineLine(withPowerline(false, [true]), 0)).toBe(true);
        expect(isPowerlineLine(withPowerline(false, [true]), 1)).toBe(false);
    });

    it('tells whether every line is Powerline', () => {
        expect(isEveryLinePowerline(withPowerline(true))).toBe(true);
        expect(isEveryLinePowerline(withPowerline(true, [null, false]))).toBe(false);
        expect(isEveryLinePowerline(withPowerline(false, [true, true, true]))).toBe(true);
        expect(isEveryLinePowerline(withPowerline(false))).toBe(false);
    });

    it('tells whether any line is Powerline', () => {
        expect(isAnyLinePowerline(withPowerline(true, [false, false, false]))).toBe(false);
        expect(isAnyLinePowerline(withPowerline(false))).toBe(false);
        expect(isAnyLinePowerline(withPowerline(false, [null, true]))).toBe(true);
        expect(isAnyLinePowerline(withPowerline(true, [false]))).toBe(true);
    });
});

describe('getLineSettings', () => {
    it('gives the line its own Powerline switch', () => {
        const settings = withPowerline(true, [null, false]);

        expect(getLineSettings(settings, 0)).toBe(settings);
        expect(getLineSettings(settings, 1).powerline.enabled).toBe(false);
        expect(getLineSettings(withPowerline(false, [true]), 0).powerline.enabled).toBe(true);
    });
});

describe('getLineRenderItems', () => {
    const items: WidgetItem[] = [
        { id: 'a', type: 'model', color: 'cyan', backgroundColor: 'bgBlue' },
        { id: 'b', type: 'separator' },
        { id: 'c', type: 'git-branch', color: 'magenta' }
    ];

    // Its backgrounds are Powerline colors, which a plain line doesn't draw
    it('drops backgrounds on a line set to plain while Powerline is on', () => {
        expect(getLineRenderItems(withPowerline(true, [false]), 0, items)).toEqual([
            { id: 'a', type: 'model', color: 'cyan' },
            { id: 'b', type: 'separator' },
            { id: 'c', type: 'git-branch', color: 'magenta' }
        ]);
    });

    it('keeps backgrounds on Powerline lines and in plain mode', () => {
        expect(getLineRenderItems(withPowerline(true), 0, items)).toBe(items);
        expect(getLineRenderItems(withPowerline(false), 0, items)).toBe(items);
        expect(getLineRenderItems(withPowerline(false, [true]), 0, items)).toBe(items);
    });
});

describe('drawsWidgetBackgrounds', () => {
    it('is false only for a line set to plain while Powerline is on', () => {
        expect(drawsWidgetBackgrounds(withPowerline(true, [null, false]), 0)).toBe(true);
        expect(drawsWidgetBackgrounds(withPowerline(true, [null, false]), 1)).toBe(false);
        expect(drawsWidgetBackgrounds(withPowerline(false), 1)).toBe(true);
        expect(drawsWidgetBackgrounds(withPowerline(false, [true]), 0)).toBe(true);
    });
});

describe('toggleLinePowerline', () => {
    it('switches a line and stores nothing when it matches the global switch', () => {
        const plain = toggleLinePowerline(withPowerline(true), 1);
        expect(plain.powerline.lineEnabled).toEqual([null, false]);
        expect(isPowerlineLine(plain, 1)).toBe(false);

        expect(toggleLinePowerline(plain, 1).powerline.lineEnabled).toBeUndefined();
        expect(toggleLinePowerline(withPowerline(false), 0).powerline.lineEnabled).toEqual([true]);
    });
});

describe('moving and deleting lines', () => {
    it('moves a line\'s setting with it, the others keeping their order', () => {
        expect(moveLinePowerline([null, false], 1, 0)).toEqual([false]);
        expect(moveLinePowerline([false], 0, 2)).toEqual([null, null, false]);
        // Past the end to the start: the others shift down rather than swap
        expect(moveLinePowerline([false, true, null], 2, 0)).toEqual([null, false, true]);
        expect(moveLinePowerline(undefined, 0, 1)).toBeUndefined();
    });

    it('drops a deleted line\'s setting and shifts the rest up', () => {
        expect(removeLinePowerline([null, false, true], 1)).toEqual([null, true]);
        expect(removeLinePowerline([false], 0)).toBeUndefined();
        expect(removeLinePowerline(undefined, 0)).toBeUndefined();
    });
});

// Auto-align lines up columns across Powerline lines only
describe('getAutoAlignLines', () => {
    it('leaves plain lines out, keeping each line\'s place', () => {
        const preRendered = [['a1', 'a2'], ['b1'], ['c1', 'c2', 'c3']];

        expect(getAutoAlignLines(withPowerline(true, [null, false]), preRendered)).toEqual([['a1', 'a2'], [], ['c1', 'c2', 'c3']]);
        expect(getAutoAlignLines(withPowerline(false, [true]), preRendered)).toEqual([['a1', 'a2'], [], []]);
    });
});
