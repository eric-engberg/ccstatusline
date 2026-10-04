import stripAnsi from 'strip-ansi';
import {
    describe,
    expect,
    it
} from 'vitest';

import { paintGradientBar } from '../gradient-bar';

const ESC = '\x1b';
const DEFAULT_FG = `${ESC}[39m`;

// The color codes in a painted bar, in order
function codes(painted: string): string[] {
    return painted.match(/\x1b\[[0-9;]*m/g) ?? [];
}

describe('paintGradientBar', () => {
    it('changes only colors, never the bar itself', () => {
        for (const bar of ['[████░░░░]', '[░░░░]', '[████]', '▓▓▓░░░░░']) {
            expect(stripAnsi(paintGradientBar(bar, 'truecolor'))).toBe(bar);
        }
    });

    it('runs filled cells from green to red by position, in true RGB', () => {
        const painted = paintGradientBar('[█████]', 'truecolor');
        expect(painted.startsWith(`[${ESC}[38;2;0;200;80m█`)).toBe(true);
        expect(painted).toContain(`${ESC}[38;2;220;200;0m█`);
        expect(painted.endsWith(`${ESC}[38;2;220;40;20m█${DEFAULT_FG}]`)).toBe(true);
    });

    it('colors a cell by where it sits in the bar, not by how full the bar is', () => {
        const quarter = codes(paintGradientBar('[██░░░░░░]', 'truecolor'));
        const full = codes(paintGradientBar('[████████]', 'truecolor'));
        expect(quarter.slice(0, 2)).toEqual(full.slice(0, 2));
    });

    it('paints empty cells dark gray and ends the colored run before the bracket', () => {
        const painted = paintGradientBar('[█░░]', 'truecolor');
        expect(painted).toBe(`[${ESC}[38;2;0;200;80m█${ESC}[38;2;60;60;60m░░${DEFAULT_FG}]`);
    });

    it('uses the nearest palette colors at 256 colors', () => {
        expect(paintGradientBar('[███]', 'ansi256')).toBe(`[${ESC}[38;5;42m█${ESC}[38;5;184m█${ESC}[38;5;166m█${DEFAULT_FG}]`);
        expect(paintGradientBar('[░]', 'ansi256')).toBe(`[${ESC}[38;5;237m░${DEFAULT_FG}]`);
    });

    it('falls back to green, yellow and red bands at 16 colors', () => {
        expect(paintGradientBar('[██████░]', 'ansi16')).toBe(
            `[${ESC}[32m██${ESC}[33m██${ESC}[31m██${ESC}[90m░${DEFAULT_FG}]`
        );
    });

    it('colors the slider bar\'s filled cells too', () => {
        const painted = paintGradientBar('▓▓░░', 'truecolor');
        expect(painted.startsWith(`${ESC}[38;2;0;200;80m▓`)).toBe(true);
        expect(painted.endsWith(`${ESC}[38;2;60;60;60m░░${DEFAULT_FG}`)).toBe(true);
    });
});
