import stripAnsi from 'strip-ansi';
import {
    describe,
    expect,
    it
} from 'vitest';

import { DEFAULT_SETTINGS } from '../../../types/Settings';
import type { WidgetItem } from '../../../types/Widget';
import { drawWidgetBar } from '../bar-draw';
import {
    BAR_GRADIENT_PRESETS,
    cycleGradientPreset,
    filterGradientKeybinds,
    getGradientModifier,
    getGradientPreset,
    noteGradientNeedsTruecolor,
    paintBarCells,
    type BarGradientPreset
} from '../gradient-bar';
import type { BarCell } from '../progress-bar';

const ESC = '\x1b';
const DEFAULT_FG = `${ESC}[39m`;
const BLOCK = { filled: '█', empty: '░' };
const SLIDER = { filled: '▓', empty: '░' };

// The color codes in a painted bar, in order
function codes(painted: string): string[] {
    return painted.match(/\x1b\[[0-9;]*m/g) ?? [];
}

// The cells of a bar as drawn, so cases read as the bar they paint
function cellsOf(bar: string): BarCell[] {
    return Array.from(bar).map((char) => {
        if (char === '░') {
            return 'empty';
        }
        return char === '│' ? 'cursor' : 'filled';
    });
}

// A block bar, given as drawn, painted inside its brackets
function paintBlock(bar: string, preset: BarGradientPreset = 'traffic', reversed = false): string {
    return `[${paintBarCells(cellsOf(bar.slice(1, -1)), BLOCK, { preset, reversed })}]`;
}

function paintSlider(bar: string, preset: BarGradientPreset = 'traffic'): string {
    return paintBarCells(cellsOf(bar), SLIDER, { preset });
}

describe('paintBarCells', () => {
    it('changes only colors, never the bar itself', () => {
        for (const bar of ['[████░░░░]', '[░░░░]', '[████]', '[██│░░]']) {
            expect(stripAnsi(paintBlock(bar))).toBe(bar);
        }
        expect(stripAnsi(paintSlider('▓▓▓░░░░░'))).toBe('▓▓▓░░░░░');
    });

    it('draws the bar unpainted without a preset', () => {
        expect(paintBarCells(cellsOf('██│░░'), BLOCK, { preset: null })).toBe('██│░░');
    });

    it('runs filled cells from green to red by position, in true RGB', () => {
        const painted = paintBlock('[█████]');
        expect(painted.startsWith(`[${ESC}[38;2;0;200;80m█`)).toBe(true);
        expect(painted).toContain(`${ESC}[38;2;220;200;0m█`);
        expect(painted.endsWith(`${ESC}[38;2;220;40;20m█${DEFAULT_FG}]`)).toBe(true);
    });

    it('colors a cell by where it sits in the bar, not by how full the bar is', () => {
        const quarter = codes(paintBlock('[██░░░░░░]'));
        const full = codes(paintBlock('[████████]'));
        expect(quarter.slice(0, 2)).toEqual(full.slice(0, 2));
    });

    it('paints empty cells dark gray and ends the colored run before the bracket', () => {
        expect(paintBlock('[█░░]')).toBe(`[${ESC}[38;2;0;200;80m█${ESC}[38;2;60;60;60m░░${DEFAULT_FG}]`);
    });

    // The cursor keeps the widget color and still counts toward each cell's position
    it('leaves the time cursor in the widget color', () => {
        expect(paintBlock('[█│░]')).toBe(`[${ESC}[38;2;0;200;80m█${DEFAULT_FG}│${ESC}[38;2;60;60;60m░${DEFAULT_FG}]`);
    });

    it('runs the gradient from its urgent end when the bar fills with what is left', () => {
        expect(codes(paintBlock('[██░░]', 'traffic', true))[0]).toBe(`${ESC}[38;2;220;40;20m`);
    });

    it('starts and ends each preset on its own colors', () => {
        const ends = (preset: BarGradientPreset) => {
            const found = codes(paintBlock('[████████]', preset));
            return [found[0], found.at(-2)];
        };
        const seen = new Set<string>();
        for (const preset of BAR_GRADIENT_PRESETS) {
            const [first, last] = ends(preset);
            expect(first).not.toBe(last);
            seen.add(`${first}${last}`);
        }
        expect(seen.size).toBe(BAR_GRADIENT_PRESETS.length);
        expect(ends('traffic')).toEqual([`${ESC}[38;2;0;200;80m`, `${ESC}[38;2;220;40;20m`]);
    });

    it('gets brighter from end to end in the colorblind-safe presets', () => {
        const luminance = (code: string | undefined) => {
            const [r = 0, g = 0, b = 0] = (code ?? '').replace(`${ESC}[38;2;`, '').replace('m', '').split(';').map(Number);
            return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        for (const preset of ['viridis', 'cividis', 'mono'] as const) {
            const cells = codes(paintBlock('[████████]', preset)).slice(0, -1);
            const values = cells.map(luminance);
            expect(values).toEqual([...values].sort((a, b) => a - b));
        }
    });

    it('colors the slider bar\'s filled cells too', () => {
        const painted = paintSlider('▓▓░░');
        expect(painted.startsWith(`${ESC}[38;2;0;200;80m▓`)).toBe(true);
        expect(painted.endsWith(`${ESC}[38;2;60;60;60m░░${DEFAULT_FG}`)).toBe(true);
    });

    // Which cells are filled comes from the bar's layout, so a bar that draws
    // both with the same character is painted the same way
    it('tells filled cells from empty ones without reading their characters', () => {
        const sameGlyph = { filled: 'x', empty: 'x' };
        expect(paintBarCells(cellsOf('█░'), sameGlyph, { preset: 'traffic' })).toBe(`${ESC}[38;2;0;200;80mx${ESC}[38;2;60;60;60mx${DEFAULT_FG}`);
    });
});

// A cell bar draws its filled and empty cells with one character, so its
// empty cells are drawn as they would look filled, but faint
describe('paintBarCells with faint empty cells', () => {
    const CELL = { filled: '▮', empty: '▮' };
    const FAINT = `${ESC}[2m`;
    const NORMAL = `${ESC}[22m`;
    const withoutFaint = (painted: string) => painted.replaceAll(FAINT, '').replaceAll(NORMAL, '');

    it('wraps the empty cells in faint and nothing else without a preset', () => {
        expect(paintBarCells(cellsOf('██░░'), CELL, { preset: null, faintEmpty: { bold: false } })).toBe(`▮▮${FAINT}▮▮${NORMAL}`);
    });

    it('colors each empty cell as it would be colored filled', () => {
        const painted = paintBarCells(cellsOf('██░░'), CELL, { preset: 'traffic', faintEmpty: { bold: false } });
        const full = paintBarCells(cellsOf('████'), CELL, { preset: 'traffic' });

        expect(codes(painted).filter(code => code !== FAINT && code !== NORMAL)).toEqual(codes(full));
        expect(painted.endsWith(`${ESC}[38;2;220;40;20m▮${NORMAL}${DEFAULT_FG}`)).toBe(true);
        expect(withoutFaint(painted)).toBe(full);
    });

    it('runs the empty cells\' colors from the urgent end too when reversed', () => {
        const painted = paintBarCells(cellsOf('░░██'), CELL, { preset: 'traffic', reversed: true, faintEmpty: { bold: false } });
        expect(painted.startsWith(`${FAINT}${ESC}[38;2;220;40;20m▮`)).toBe(true);
    });

    // SGR 22 ends bold as well as faint
    it('turns bold back on after the empty cells of a bold widget', () => {
        expect(paintBarCells(cellsOf('█░█'), CELL, { preset: null, faintEmpty: { bold: true } })).toBe(`▮${FAINT}▮${ESC}[22;1m▮`);
    });

    it('keeps the time cursor at full intensity', () => {
        expect(paintBarCells(cellsOf('█░│░'), CELL, { preset: null, faintEmpty: { bold: false } })).toBe(`▮${FAINT}▮${NORMAL}│${FAINT}▮${NORMAL}`);
    });

    it('leaves a full bar without faint', () => {
        expect(paintBarCells(cellsOf('███'), CELL, { preset: null, faintEmpty: { bold: false } })).toBe('▮▮▮');
    });
});

// A cell bar can draw its empty cells in a fixed color instead, the dark gray
// the gradient bars give theirs
describe('paintBarCells with a color for the empty cells', () => {
    const CELL = { filled: '▮', empty: '▮' };
    const GRAY = `${ESC}[38;5;237m`;

    it('colors only the empty cells without a preset, ending on the default foreground', () => {
        expect(paintBarCells(cellsOf('██░░'), CELL, { preset: null, emptyCode: GRAY })).toBe(`▮▮${GRAY}▮▮${DEFAULT_FG}`);
    });

    it('colors the filled cells by the preset and the empty ones in the given color', () => {
        // The first two cells of a full bar, colored where they sit
        const [first, second] = codes(paintBarCells(cellsOf('████'), CELL, { preset: 'traffic' }));

        expect(paintBarCells(cellsOf('██░░'), CELL, { preset: 'traffic', emptyCode: GRAY })).toBe(`${first}▮${second}▮${GRAY}▮▮${DEFAULT_FG}`);
    });

    it('keeps the time cursor in the widget color', () => {
        expect(paintBarCells(cellsOf('█░│░'), CELL, { preset: null, emptyCode: GRAY })).toBe(`▮${GRAY}▮${DEFAULT_FG}│${GRAY}▮${DEFAULT_FG}`);
    });

    it('leaves a full bar unpainted', () => {
        expect(paintBarCells(cellsOf('███'), CELL, { preset: null, emptyCode: GRAY })).toBe('▮▮▮');
    });
});

describe('the line editor\'s truecolor rule', () => {
    const gradientKey = { key: 'g', label: '(g)radient', action: 'cycle-gradient' };
    const progressKey = { key: 'p', label: '(p)rogress toggle', action: 'toggle-progress' };

    it('hides (g) below truecolor and keeps the other keys', () => {
        expect(filterGradientKeybinds([progressKey, gradientKey], { ...DEFAULT_SETTINGS, colorLevel: 3 })).toEqual([progressKey, gradientKey]);
        expect(filterGradientKeybinds([progressKey, gradientKey], { ...DEFAULT_SETTINGS, colorLevel: 2 })).toEqual([progressKey]);
    });

    it('notes that a saved preset needs truecolor below it', () => {
        const color256 = { ...DEFAULT_SETTINGS, colorLevel: 2 } as const;
        expect(noteGradientNeedsTruecolor('(long bar, gradient: blue-orange)', color256)).toBe('(long bar, gradient: blue-orange, needs truecolor)');
        expect(noteGradientNeedsTruecolor('(long bar, gradient: blue-orange)', { ...DEFAULT_SETTINGS, colorLevel: 3 })).toBe('(long bar, gradient: blue-orange)');
        expect(noteGradientNeedsTruecolor('(long bar)', color256)).toBe('(long bar)');
        expect(noteGradientNeedsTruecolor(undefined, color256)).toBeUndefined();
    });
});

// Value colors give a bar one color for its level, so a bar gradient, which
// colors each cell by where it sits, is never on with them
describe('a bar gradient and value colors', () => {
    const bar: WidgetItem = { id: 'b', type: 'context-bar' };

    it('sets a saved preset aside while value colors are on', () => {
        const both: WidgetItem = { ...bar, metadata: { gradient: 'thermal', valueColors: 'true' } };

        expect(getGradientPreset(both)).toBeNull();
        expect(getGradientModifier(both)).toBeNull();
        expect(drawWidgetBar({ ...both, metadata: { ...both.metadata, display: 'slider' } }, 50, 4, { ...DEFAULT_SETTINGS, colorLevel: 3 })).toBe('▓▓░░');
    });

    it('turns value colors off, keeping their settings, when (g) turns a preset on', () => {
        const colored: WidgetItem = { ...bar, metadata: { valueColors: 'true', valueColorMode: 'gradient' } };

        expect(cycleGradientPreset(colored).metadata).toEqual({ valueColorMode: 'gradient', gradient: 'traffic' });
        expect(cycleGradientPreset({ ...bar, metadata: { gradient: 'traffic' } }).metadata).toEqual({ gradient: 'thermal' });
    });
});
