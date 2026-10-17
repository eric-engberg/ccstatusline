import stripAnsi from 'strip-ansi';
import {
    describe,
    expect,
    it
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import {
    DEFAULT_SETTINGS,
    type Settings
} from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import { getColorAnsiCode } from '../../utils/colors';
import {
    calculateMaxWidthsFromPreRendered,
    preRenderAllWidgets,
    renderStatusLine
} from '../../utils/renderer';
import { getWidget } from '../../utils/widgets';
import { gradientPresetCodeAt } from '../shared/gradient-bar';

const FG_RESET = '\x1b[39m';
// The empty cells' faint, and the codes that end it: normal intensity, and
// normal intensity then bold again for a bold widget
const FAINT = '\x1b[2m';
const NORMAL = '\x1b[22m';
const NORMAL_BOLD = '\x1b[22;1m';
const HIGH = '\x1b[38;2;255;0;0m';
const HIGH_256 = '\x1b[38;5;196m';
const TRAFFIC_CALM = '\x1b[38;2;0;200;80m';
const TRAFFIC_URGENT = '\x1b[38;2;220;40;20m';
const BAND_COLORS = {
    'valueColors': 'true',
    'valueColor.low': 'hex:00ff00',
    'valueColor.mid': 'hex:ffff00',
    'valueColor.high': 'hex:ff0000'
};

const truecolor: Settings = { ...DEFAULT_SETTINGS, colorLevel: 3 };
const color256: Settings = { ...DEFAULT_SETTINGS, colorLevel: 2 };
const color16: Settings = { ...DEFAULT_SETTINGS, colorLevel: 1 };
const noColor: Settings = { ...DEFAULT_SETTINGS, colorLevel: 0 };
const preview: RenderContext = { isPreview: true };

// Each cell shape, its stored name (none for the first) and its character
const SHAPES: { name: string; glyph: string; metadata: Record<string, string> }[] = [
    { name: 'rectangle', glyph: '▮', metadata: { display: 'cells' } },
    { name: 'square', glyph: '■', metadata: { display: 'cells', barCell: 'square' } },
    { name: 'seven-eighths', glyph: '▉', metadata: { display: 'cells', barCell: 'seven-eighths' } },
    { name: 'parallelogram', glyph: '▰', metadata: { display: 'cells', barCell: 'parallelogram' } }
];

function render(type: string, metadata: Record<string, string>, settings: Settings = truecolor, context: RenderContext = preview): string {
    const widget = getWidget(type);
    if (!widget) {
        throw new Error(`no widget registered for ${type}`);
    }
    return widget.render({ id: 'w', type, metadata }, context, settings) ?? '';
}

function press(type: string, item: WidgetItem): WidgetItem {
    const widget = getWidget(type);
    const action = (widget?.getCustomKeybinds?.(item) ?? []).find(keybind => keybind.key === 'p')?.action;
    if (!widget || !action) {
        throw new Error(`${type} offers no (p)`);
    }
    return widget.handleEditorAction?.(action, item) ?? item;
}

// The metadata after each (p) press, starting from none
function cycle(type: string, presses: number): (Record<string, string> | undefined)[] {
    const seen: (Record<string, string> | undefined)[] = [];
    let item: WidgetItem = { id: 'w', type };
    for (let i = 0; i < presses; i++) {
        item = press(type, item);
        seen.push(item.metadata);
    }
    return seen;
}

function repeat(glyph: string, count: number): string {
    return glyph.repeat(count);
}

describe('(p) through the cell styles', () => {
    const cellSteps = (size: Record<string, string>) => SHAPES.map(shape => ({ ...shape.metadata, ...size }));

    it.each([
        'session-usage',
        'weekly-usage',
        'weekly-sonnet-usage',
        'weekly-opus-usage',
        'fable-weekly-usage',
        'spend-limit-usage',
        'extra-usage-utilization'
    ])('%s goes text, block, slider, the four cell shapes, the level glyph, then text', (type) => {
        expect(cycle(type, 9)).toEqual([
            { display: 'progress' },
            { display: 'slider', barWidth: 'long' },
            ...cellSteps({ barWidth: 'long' }),
            { display: 'glyph', barWidth: 'long' },
            { display: 'time', barWidth: 'long' },
            { display: 'progress' }
        ]);
    });

    it.each(['block-timer', 'reset-timer', 'weekly-reset-timer'])('%s goes text, block, slider, the four cell shapes, then text', (type) => {
        expect(cycle(type, 8)).toEqual([
            { display: 'progress' },
            { display: 'slider', barWidth: 'long' },
            ...cellSteps({ barWidth: 'long' }),
            { display: 'time', barWidth: 'long' },
            { display: 'progress' }
        ]);
    });

    // A medium block bar with no display mode saved; medium is a cell bar's own size
    it('takes the Context Bar from block to slider, through the four cell shapes and back to block', () => {
        expect(cycle('context-bar', 6)).toEqual([
            { display: 'slider', barWidth: 'medium' },
            ...cellSteps({}),
            { display: 'progress-short' }
        ]);
    });

    it.each(['context-percentage', 'context-percentage-usable'])('%s goes from the percentage to a slider, the four cell shapes, the level glyph and back', (type) => {
        expect(cycle(type, 8)).toEqual([
            { display: 'slider' },
            ...cellSteps({ barWidth: 'short' }),
            { display: 'glyph', barWidth: 'short' },
            { barWidth: 'short' },
            { display: 'slider' }
        ]);
    });

    it('keeps the numbers setting, the time cursor and the gradient from shape to shape', () => {
        const start: WidgetItem = { id: 'w', type: 'session-usage', metadata: { display: 'slider', barNumbers: 'none', cursor: 'true', gradient: 'thermal', invert: 'true' } };
        const cells = press('session-usage', start);
        const square = press('session-usage', cells);

        expect(cells.metadata).toEqual({ display: 'cells', barWidth: 'short', barNumbers: 'none', cursor: 'true', gradient: 'thermal', invert: 'true' });
        expect(square.metadata).toEqual({ ...cells.metadata, barCell: 'square' });
    });

    it('names each shape in the line editor', () => {
        const modifierText = (type: string, metadata: Record<string, string>) => getWidget(type)?.getEditorDisplay({ id: 'w', type, metadata }).modifierText;

        expect(modifierText('session-usage', { display: 'cells', barWidth: 'long' })).toBe('(cells ▮, long, used)');
        expect(modifierText('block-timer', { display: 'cells', barCell: 'square' })).toBe('(cells ■, medium)');
        expect(modifierText('context-bar', { display: 'cells', barCell: 'seven-eighths', barNumbers: 'none' })).toBe('(cells ▉, medium, numbers off)');
        expect(modifierText('context-percentage', { display: 'cells', barCell: 'parallelogram', barWidth: '40', gradient: 'viridis' })).toBe('(cells ▰, 40% width, gradient: viridis)');
    });

    it('offers the bar\'s keys on a cell bar', () => {
        const keys = (type: string) => (getWidget(type)?.getCustomKeybinds?.({ id: 'w', type, metadata: { display: 'cells' } }) ?? []).map(keybind => keybind.key);

        expect(keys('session-usage')).toEqual(['p', 'u', 't', 'g', 'b', 'n', 'v']);
        expect(keys('block-timer')).toEqual(['p', 'v', 'g', 'b', 'n']);
        expect(keys('context-percentage')).toEqual(['u', 'p', 'g', 'b', 'n', 'v']);
    });
});

describe('cell bar rendering', () => {
    // Block Usage's preview is 90% used: 14 of a medium bar's 16 cells
    it.each(SHAPES)('draws filled and empty $name cells with $glyph, the empty ones faint', ({ glyph, metadata }) => {
        expect(render('session-usage', metadata)).toBe(`5h: ${repeat(glyph, 14)}${FAINT}${repeat(glyph, 2)}${NORMAL} 90.0%`);
        expect(render('context-bar', metadata)).toBe(`Context: ${repeat(glyph, 14)}${FAINT}${repeat(glyph, 2)}${NORMAL} 180k/200k (90%)`);
    });

    // Faint needs no color of its own, so it is the same at every level
    it('draws the empty cells faint at every color level', () => {
        const cells = { display: 'cells' };
        for (const settings of [truecolor, color256, color16]) {
            expect(render('weekly-usage', cells, settings)).toBe(`Weekly: ${repeat('▮', 13)}${FAINT}▮▮▮${NORMAL} 80.0%`);
        }
    });

    // Filled and empty cells are the same character, so with no styling at all
    // they look alike; only the percent tells how full the bar is
    it('styles nothing at the No Color level', () => {
        expect(render('weekly-usage', { display: 'cells' }, noColor)).toBe(`Weekly: ${repeat('▮', 16)} 80.0%`);
    });

    it('keeps the empty cells faint under a global foreground override, which takes a gradient away', () => {
        const override: Settings = { ...truecolor, overrideForegroundColor: 'red' };
        expect(render('weekly-usage', { display: 'cells', gradient: 'traffic' }, override)).toBe(`Weekly: ${repeat('▮', 13)}${FAINT}▮▮▮${NORMAL} 80.0%`);
    });

    // Ending faint (SGR 22) ends bold too
    it('turns bold back on after the empty cells of a bold widget', () => {
        const bold = getWidget('session-usage')?.render({ id: 'w', type: 'session-usage', bold: true, metadata: { display: 'cells' } }, preview, truecolor);
        expect(bold).toBe(`5h: ${repeat('▮', 14)}${FAINT}▮▮${NORMAL_BOLD} 90.0%`);
        expect(render('session-usage', { display: 'cells' }, { ...truecolor, globalBold: true })).toBe(`5h: ${repeat('▮', 14)}${FAINT}▮▮${NORMAL_BOLD} 90.0%`);
    });

    // A dimmed widget's text is all faint already
    it('adds nothing to a dimmed widget', () => {
        const dimmed = getWidget('session-usage')?.render({ id: 'w', type: 'session-usage', dim: true, metadata: { display: 'cells' } }, preview, truecolor);
        expect(dimmed).toBe(`5h: ${repeat('▮', 16)} 90.0%`);
    });

    it('keeps the time cursor │ at full intensity in the widget color', () => {
        // The preview's cursor sits halfway: cell 8 of 16
        expect(render('session-usage', { display: 'cells', cursor: 'true' })).toBe(`5h: ${repeat('▮', 8)}│${repeat('▮', 5)}${FAINT}▮▮${NORMAL} 90.0%`);
    });

    it('fills with what\'s left when inverted', () => {
        expect(render('session-usage', { display: 'cells', invert: 'true' })).toBe(`5h: ▮▮${FAINT}${repeat('▮', 14)}${NORMAL} 10.0%`);
    });

    it('draws a cell bar on the timers and on Context %', () => {
        expect(stripAnsi(render('block-timer', { display: 'cells', barCell: 'square' }))).toBe(`Block ${repeat('■', 16)} 73.9%`);
        expect(render('context-percentage', { display: 'cells', barCell: 'parallelogram', barWidth: 'short' })).toBe(`Ctx Used: ${repeat('▰', 9)}${FAINT}▰${NORMAL} 90.0%`);
    });

    // Faint is no color, so the widget color (or a global override) still
    // covers every cell; only value colors and gradients color runs of their own
    it.each(['session-usage', 'block-timer', 'weekly-reset-timer', 'extra-usage-utilization', 'context-percentage', 'context-bar'])('%s colors no runs of its own as a cell bar without them', (type) => {
        const colorsOnlyItsRuns = (metadata: Record<string, string>) => getWidget(type)?.colorsOnlyItsRuns?.({ id: 'w', type, metadata });
        expect(colorsOnlyItsRuns({ display: 'cells' })).toBe(false);
        expect(colorsOnlyItsRuns({ display: 'cells', gradient: 'traffic' })).toBe(true);
    });

    describe('with value colors', () => {
        it('colors the whole bar and the percent by level, the empty cells faint', () => {
            expect(render('session-usage', { display: 'cells', ...BAND_COLORS })).toBe(`5h: ${HIGH}${repeat('▮', 14)}${FAINT}▮▮${NORMAL} 90.0%${FG_RESET}`);
            expect(render('session-usage', { display: 'cells', ...BAND_COLORS }, color256)).toBe(`5h: ${HIGH_256}${repeat('▮', 14)}${FAINT}▮▮${NORMAL} 90.0%${FG_RESET}`);
        });

        it('colors the label too when set to the whole widget', () => {
            expect(render('context-bar', { display: 'cells', barNumbers: 'percent', ...BAND_COLORS, valueColorScope: 'widget' }))
                .toBe(`${HIGH}Context: ${repeat('▮', 14)}${FAINT}▮▮${NORMAL} 90%${FG_RESET}`);
        });

        // A value color gradient needs more than 16 colors, so the bar keeps the widget color
        it('keeps the empty cells faint in gradient mode at 16 colors', () => {
            expect(render('session-usage', { display: 'cells', valueColors: 'true', valueColorMode: 'gradient' }, color16))
                .toBe(`5h: ${repeat('▮', 14)}${FAINT}▮▮${NORMAL} 90.0%`);
        });

        it('gives the gradient mode\'s color to every cell', () => {
            const output = render('context-percentage', { display: 'cells', valueColors: 'true', valueColorMode: 'gradient' });
            expect(output).toMatch(/^Ctx Used: \x1b\[38;2;\d+;\d+;\d+m▮{14}\x1b\[2m▮▮\x1b\[22m 90\.0%\x1b\[39m$/);
        });
    });

    describe('with a gradient preset', () => {
        // Each cell, filled or empty, takes the color of where it sits
        it.each(SHAPES)('colors each $name cell by where it sits, the empty ones faint', ({ glyph, metadata }) => {
            const output = render('session-usage', { ...metadata, gradient: 'traffic' });
            expect(output.startsWith(`5h: ${TRAFFIC_CALM}${glyph}`)).toBe(true);
            expect(output.endsWith(`${FAINT}${gradientPresetCodeAt('traffic', 14 / 15, 'truecolor')}${glyph}${TRAFFIC_URGENT}${glyph}${NORMAL}${FG_RESET} 90.0%`)).toBe(true);
            expect(output.match(/\x1b\[38;2;/g)?.length).toBe(16);
            expect(stripAnsi(output)).toBe(`5h: ${repeat(glyph, 16)} 90.0%`);
        });

        it('starts from the urgent end when the bar fills with what\'s left', () => {
            expect(render('context-percentage', { display: 'cells', gradient: 'traffic', inverse: 'true' }).startsWith(`Ctx Left: ${TRAFFIC_URGENT}▮`)).toBe(true);
        });

        // Gradients need truecolor; faint doesn't
        it('leaves the cells in the widget color below truecolor', () => {
            expect(render('session-usage', { display: 'cells', gradient: 'traffic' }, color256)).toBe(`5h: ${repeat('▮', 14)}${FAINT}▮▮${NORMAL} 90.0%`);
        });
    });
});

describe('cell bars on the status line', () => {
    function renderLine(items: WidgetItem[], settings: Settings): string {
        const preRendered = preRenderAllWidgets([items], settings, preview);
        return renderStatusLine(items, settings, preview, preRendered[0] ?? [], calculateMaxWidthsFromPreRendered(preRendered, settings));
    }
    const withPowerline = (settings: Settings, powerline: boolean, theme?: string): Settings => ({
        ...settings,
        powerline: { ...settings.powerline, enabled: powerline, ...(theme ? { theme } : {}) }
    });
    const cells: WidgetItem = { id: 'w', type: 'session-usage', metadata: { display: 'cells' } };
    const EMPTY_RUN = `5h: ${repeat('▮', 14)}${FAINT}▮▮${NORMAL} 90.0%`;

    it.each([false, true])('draws the empty cells faint inside the widget color (Powerline: %s)', (powerline) => {
        const line = renderLine([{ ...cells, color: 'hex:81A1C1' }], withPowerline(truecolor, powerline));
        const widgetColor = '\x1b[38;2;129;161;193m';

        expect(line).toContain(EMPTY_RUN);
        expect(line.indexOf(widgetColor)).toBeLessThan(line.indexOf('5h: '));
        expect(line).not.toContain('60;60;60');
    });

    // Nord Aurora's second segment is light yellow with dark text, which a
    // fixed dark gray for the empty cells would match
    it('draws the empty cells faint in a light Powerline segment\'s dark text color', () => {
        const line = renderLine([{ id: 'm', type: 'model' }, cells], withPowerline(truecolor, true, 'nord-aurora'));
        const segment = `${getColorAnsiCode('hex:2E3440', 'truecolor')}${getColorAnsiCode('hex:EBCB8B', 'truecolor', true)}${EMPTY_RUN}`;

        expect(line).toContain(segment);
    });

    it.each([false, true])('ends faint inside the widget, before its separator (Powerline: %s)', (powerline) => {
        const line = renderLine([cells, { id: 'm', type: 'model' }], withPowerline({ ...truecolor, defaultSeparator: '|' }, powerline, 'nord-aurora'));
        const afterBar = line.slice(line.indexOf(EMPTY_RUN) + EMPTY_RUN.length);

        expect(line).toContain(EMPTY_RUN);
        expect(afterBar).not.toContain(FAINT);
    });

    it.each([false, true])('keeps a bold widget bold after the empty cells (Powerline: %s)', (powerline) => {
        const line = renderLine([{ ...cells, bold: true }], withPowerline(truecolor, powerline));
        expect(line).toContain('\x1b[1m');
        expect(line).toContain(`5h: ${repeat('▮', 14)}${FAINT}▮▮${NORMAL_BOLD} 90.0%`);
    });

    // The empty cells color no runs of their own, so a gradient widget color
    // sweeps across them too
    it('sweeps a gradient widget color across every cell, the empty ones faint', () => {
        const line = renderLine([{ ...cells, color: 'gradient:atlas' }], truecolor);
        expect(line).toMatch(/\x1b\[2m(\x1b\[38;2;\d+;\d+;\d+m▮){2}\x1b\[22m/);
        expect(line.startsWith('\x1b[38;2;254;172;94m5')).toBe(true);
    });

    // A global foreground override takes the widget's colors away, value colors
    // and gradients included, but not the empty cells' faint
    it.each([false, true])('keeps the empty cells faint in a global foreground override (Powerline: %s)', (powerline) => {
        const override: Settings = withPowerline({ ...truecolor, overrideForegroundColor: 'hex:ff8800' }, powerline);
        const colorings: Record<string, string>[] = [{ display: 'cells' }, { display: 'cells', ...BAND_COLORS }, { display: 'cells', gradient: 'traffic' }];
        for (const metadata of colorings) {
            const line = renderLine([{ ...cells, metadata }], override);
            expect(line).toContain('\x1b[38;2;255;136;0m');
            expect(line).toContain(EMPTY_RUN);
            expect(line).not.toContain(HIGH);
        }
    });
});

describe('cell bar settings from other builds', () => {
    it('draws an unknown cell shape as the first one', () => {
        expect(stripAnsi(render('weekly-usage', { display: 'cells', barCell: 'hexagon' }))).toBe(`Weekly: ${repeat('▮', 16)} 80.0%`);
        expect(getWidget('weekly-usage')?.getEditorDisplay({ id: 'w', type: 'weekly-usage', metadata: { display: 'cells', barCell: 'hexagon' } }).modifierText)
            .toBe('(cells ▮, medium, used)');
    });

    it.each(['session-usage', 'block-timer', 'context-percentage', 'context-bar'])('renders %s with an unknown display mode as it does with none', (type) => {
        expect(render(type, { display: 'cells-hexagon' })).toBe(render(type, {}));
    });
});
