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
import { MIN_BAR_CELLS } from '../../widgets/shared/bar-width';
import {
    getVisibleWidth,
    stripSgrCodes
} from '../ansi';
import {
    calculateMaxWidthsFromPreRendered,
    preRenderAllWidgets,
    renderStatusLine
} from '../renderer';

const contextData: RenderContext['data'] = {
    context_window: {
        context_window_size: 200000,
        current_usage: {
            input_tokens: 90000,
            output_tokens: 0,
            cache_creation_input_tokens: 5000,
            cache_read_input_tokens: 5000
        }
    }
};

function createSettings(overrides: Partial<Settings> = {}): Settings {
    return {
        ...DEFAULT_SETTINGS,
        flexMode: 'full',
        ...overrides,
        powerline: {
            ...DEFAULT_SETTINGS.powerline,
            ...(overrides.powerline ?? {})
        }
    };
}

// Renders every line the way the CLI does and returns their visible text
function renderLines(lines: WidgetItem[][], terminalWidth: number, settingsOverrides: Partial<Settings> = {}): string[] {
    const settings = createSettings(settingsOverrides);
    const context: RenderContext = { isPreview: false, terminalWidth, data: contextData };
    const preRenderedLines = preRenderAllWidgets(lines, settings, context);
    const maxWidths = calculateMaxWidthsFromPreRendered(preRenderedLines, settings);
    return lines.map((widgets, index) => stripSgrCodes(renderStatusLine(widgets, settings, { ...context, lineIndex: index }, preRenderedLines[index] ?? [], maxWidths)));
}

function renderLine(widgets: WidgetItem[], terminalWidth: number, settingsOverrides: Partial<Settings> = {}): string {
    return renderLines([widgets], terminalWidth, settingsOverrides)[0] ?? '';
}

const contextBar = (id: string, barWidth?: string, display = 'progress'): WidgetItem => ({
    id,
    type: 'context-bar',
    metadata: { display, ...(barWidth ? { barWidth } : {}) }
});
const text = (id: string, customText: string): WidgetItem => ({ id, type: 'custom-text', customText });
const countCells = (line: string): number => line.match(/[█░▓│]/g)?.length ?? 0;

// 'full' flex mode leaves 6 columns free, so a 100-column terminal gives 94
const TERMINAL = 100;
const LINE = 94;
const AUTO_ALIGN: Partial<Settings> = { powerline: { ...DEFAULT_SETTINGS.powerline, enabled: true, autoAlign: true } };

describe('bar width', () => {
    it('leaves a bar without a width setting at its mode\'s size', () => {
        expect(countCells(renderLine([contextBar('bar')], TERMINAL))).toBe(32);
    });

    it('grows a fill bar to the edge of the line', () => {
        const line = renderLine([text('t', 'model'), contextBar('bar', 'fill')], TERMINAL);
        expect(getVisibleWidth(line)).toBe(LINE);
        expect(line).not.toContain('...');
    });

    it('gives a percentage bar that share of the line', () => {
        const line = renderLine([contextBar('bar', '50')], TERMINAL);
        expect(countCells(line)).toBe(Math.round(LINE / 2));
        expect(getVisibleWidth(line)).toBeLessThan(LINE);
    });

    it('shrinks a percentage bar so the line still fits', () => {
        // Half of 44 columns is 22 cells, more than the line has room for
        const line = renderLine([contextBar('bar', '50')], 50);
        expect(getVisibleWidth(line)).toBe(44);
        expect(countCells(line)).toBeLessThan(22);
        expect(line).not.toContain('...');
    });

    it('never shrinks a bar below the minimum', () => {
        expect(countCells(renderLine([contextBar('bar', 'fill')], 30))).toBe(MIN_BAR_CELLS);
    });

    it('keeps the mode\'s size when the terminal width is unknown', () => {
        expect(countCells(renderLine([contextBar('bar', 'fill')], 0))).toBe(32);
    });

    it('splits the room evenly between fill bars', () => {
        const line = renderLine([contextBar('a', 'fill'), contextBar('b', 'fill')], 160);
        expect(getVisibleWidth(line)).toBe(154);
        const [first = '', second = ''] = line.match(/\[[█░]+\]/g) ?? [];
        expect(second.length).toBeGreaterThan(MIN_BAR_CELLS + 2);
        expect(Math.abs(first.length - second.length)).toBeLessThanOrEqual(1);
    });

    it('sizes bars the same way in Powerline mode', () => {
        const line = renderLine([text('t', 'model'), contextBar('bar', 'fill')], TERMINAL, { powerline: { ...DEFAULT_SETTINGS.powerline, enabled: true } });
        expect(getVisibleWidth(line)).toBe(LINE);
    });

    it('saves no room for a widget whose width setting has no bar to apply to', () => {
        const noSlider: WidgetItem = { id: 'pct', type: 'context-percentage', metadata: { barWidth: 'fill' } };
        const line = renderLine([noSlider, contextBar('bar', 'fill')], TERMINAL);
        expect(getVisibleWidth(line)).toBe(LINE);
        expect(line).toContain('Ctx Used: 50.0%');
    });

    it('lines other lines up with the bar at its minimum, so a grown bar doesn\'t widen them', () => {
        const [withBar = '', below = ''] = renderLines([
            [contextBar('bar', 'fill'), text('a', 'a')],
            [text('x', 'xxxxxxxx'), text('y', 'y')]
        ], TERMINAL, AUTO_ALIGN);
        expect(getVisibleWidth(withBar)).toBe(LINE);
        // The column above holds "Context: [█████] 100k/200k (50%)" at its minimum
        expect(getVisibleWidth(below)).toBeLessThan(45);
        expect(below).not.toContain('...');
    });

    // The 50-column widget below pads the bar's column 18 past the bar's minimum
    const widerBelow = [text('x', 'x'.repeat(50)), text('y', 'y')];

    it('grows a fill bar into the padding auto-align gives its column', () => {
        const [withBar = ''] = renderLines([[contextBar('bar', 'fill'), text('a', 'a')], widerBelow], TERMINAL, AUTO_ALIGN);
        expect(getVisibleWidth(withBar)).toBe(LINE);
    });

    it('counts that padding as room for a percentage bar', () => {
        const [withBar = ''] = renderLines([[contextBar('bar', '60'), text('a', 'a')], widerBelow], TERMINAL, AUTO_ALIGN);
        expect(countCells(withBar)).toBe(Math.round(LINE * 0.6));
    });

    it('counts no padding when auto-align is off', () => {
        const [withBar = ''] = renderLines([[contextBar('bar', 'fill'), text('a', 'a')], widerBelow], TERMINAL, { powerline: { ...DEFAULT_SETTINGS.powerline, enabled: true } });
        expect(getVisibleWidth(withBar)).toBe(LINE);
        expect(withBar).not.toContain('...');
    });

    it('leaves padding a bar fits in to that bar, not to the line\'s other bars', () => {
        // 10% of the line fits in the first column's padding
        const [withBars = ''] = renderLines([[contextBar('small', '10'), contextBar('bar', 'fill')], widerBelow], TERMINAL, AUTO_ALIGN);
        expect(getVisibleWidth(withBars)).toBe(LINE);
        expect(withBars).not.toContain('...');
    });

    it('counts a merge group\'s padding once for the bars in it', () => {
        const [withBars = ''] = renderLines([
            [{ ...contextBar('a', 'fill'), merge: true }, contextBar('b', 'fill')],
            [text('x', 'x'.repeat(80))]
        ], TERMINAL, AUTO_ALIGN);
        expect(getVisibleWidth(withBars)).toBe(LINE);
        expect(withBars).not.toContain('...');
    });
});
