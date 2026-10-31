import {
    describe,
    expect,
    it
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import { BlockForecastWidget } from '../BlockForecast';

import { describeValueColorsOnTheLine } from './helpers/value-colors-line';

const ITEM: WidgetItem = { id: 'forecast', type: 'block-forecast' };
const REMAINING: WidgetItem = { ...ITEM, metadata: { invert: 'true' } };

const MID = '\x1b[38;2;255;255;0m';
// At the default 256 Color level these hex colors map to palette entries
const LOW_256 = '\x1b[38;5;46m';
const MID_256 = '\x1b[38;5;226m';
const HIGH_256 = '\x1b[38;5;196m';
const FG_RESET = '\x1b[39m';
// Custom colors, so the escape codes don't depend on the terminal's color support
const BAND_COLORS = {
    'valueColors': 'true',
    'valueColor.low': 'hex:00ff00',
    'valueColor.mid': 'hex:ffff00',
    'valueColor.high': 'hex:ff0000'
};
const COLORED: WidgetItem = { ...ITEM, color: 'hex:112233', metadata: BAND_COLORS };

function render(item: WidgetItem, context: RenderContext = {}): string | null {
    return new BlockForecastWidget().render(item, context, DEFAULT_SETTINGS);
}

function live(currentPercent: number, projectedPercent: number, limitInMs: number | null = null): RenderContext {
    return { usageData: { sessionUsage: currentPercent }, sessionForecast: { currentPercent, projectedPercent, limitInMs } };
}

describe('BlockForecastWidget', () => {
    it('shows the projected usage at reset', () => {
        expect(render(ITEM, live(42, 83.2))).toBe('→83.2%');
    });

    it('shows 100% when usage is on pace for the limit', () => {
        expect(render(ITEM, live(61, 100, 4_387_500))).toBe('→100.0%');
    });

    it('shows the projected remaining percent in remaining mode', () => {
        expect(render(REMAINING, live(42, 83.2))).toBe('→16.8%');
        expect(render(REMAINING, live(61, 100, 4_387_500))).toBe('→0.0%');
    });

    it('drops the label in raw value mode', () => {
        expect(render({ ...ITEM, rawValue: true }, live(42, 83.2))).toBe('83.2%');
    });

    it('uses the widget\'s number format', () => {
        expect(render({ ...ITEM, numberFormat: { style: 'whole' } }, live(42, 83.2))).toBe('→83%');
    });

    it.each([
        ['there is no forecast', { usageData: { sessionUsage: 42 } }],
        ['nothing is known', {}],
        ['the projection reads the same as current usage', live(42, 42.04)]
    ])('renders nothing when %s', (_label, context: RenderContext) => {
        expect(render(ITEM, context)).toBeNull();
    });

    it('compares in the widget\'s number format', () => {
        expect(render({ ...ITEM, numberFormat: { style: 'whole' } }, live(42, 42.4))).toBeNull();
    });

    // An idle session's payload still has the percent from its own last
    // response, while the forecast goes from the latest reading of any session
    it('compares with the usage the forecast goes from, not an idle session\'s', () => {
        const idle: RenderContext = { usageData: { sessionUsage: 30 }, sessionForecast: { currentPercent: 42, projectedPercent: 42.0167, limitInMs: null } };

        expect(render(ITEM, idle)).toBeNull();
    });

    // On pace for the limit, so it reads with Block Limit Timer's preview
    it('shows a sample in the preview', () => {
        expect(render(ITEM, { isPreview: true })).toBe('→100.0%');
        expect(render(REMAINING, { isPreview: true })).toBe('→0.0%');
    });

    it('describes itself for the line editor', () => {
        const widget = new BlockForecastWidget();

        expect(widget.getDisplayName()).toBe('Block Forecast');
        expect(widget.getCategory()).toBe('Usage');
        expect(widget.getDefaultColor()).toBe('brightBlue');
        expect(widget.getEditorDisplay(ITEM).modifierText).toBe('(used)');
        expect(widget.getEditorDisplay(REMAINING).modifierText).toBe('(remaining)');
    });

    // A type change in the widget picker keeps the old widget's metadata, but this
    // widget never draws a bar
    it('names only what it renders after a type change from a bar', () => {
        const widget = new BlockForecastWidget();
        const fromBar: WidgetItem = { ...ITEM, metadata: { display: 'progress', invert: 'true' } };

        expect(render(fromBar, live(42, 83.2))).toBe('→16.8%');
        expect(widget.getEditorDisplay(fromBar).modifierText).toBe('(remaining)');
        expect(widget.getEditorDisplay({ ...ITEM, metadata: { display: 'slider-only' } }).modifierText).toBe('(used)');
    });

    it('toggles remaining mode with u', () => {
        const widget = new BlockForecastWidget();

        expect(widget.getCustomKeybinds(ITEM)).toEqual([
            { key: 'u', label: '(u) show remaining', action: 'toggle-invert' },
            { key: 'v', label: '(v)alue colors', action: 'edit-value-colors' }
        ]);
        expect(widget.getCustomKeybinds(REMAINING)[0]).toEqual({ key: 'u', label: '(u) show used', action: 'toggle-invert' });
        expect(widget.handleEditorAction('toggle-invert', ITEM)?.metadata?.invert).toBe('true');
        expect(widget.handleEditorAction('toggle-progress', ITEM)).toBeNull();
    });

    // The projected usage is colored like the usage percents: green below 70%
    // used, yellow below 90% and red from 90%
    describe('value colors', () => {
        it('colors the projection by the band it lands in', () => {
            const raw = { ...COLORED, rawValue: true };

            expect(render(raw, live(42, 55))).toBe(`${LOW_256}55.0%${FG_RESET}`);
            expect(render(raw, live(42, 83.2))).toBe(`${MID_256}83.2%${FG_RESET}`);
            expect(render(raw, live(61, 100, 4_387_500))).toBe(`${HIGH_256}100.0%${FG_RESET}`);
        });

        it('paints only the projection, leaving the arrow to the renderer', () => {
            expect(render(COLORED, live(42, 83.2))).toBe(`→${MID_256}83.2%${FG_RESET}`);
        });

        it('colors by the projected used percent while showing what\'s left', () => {
            expect(render({ ...COLORED, metadata: { ...BAND_COLORS, invert: 'true' } }, live(61, 100, 4_387_500))).toBe(`→${HIGH_256}0.0%${FG_RESET}`);
        });

        it('previews on pace for the limit, in the high color', () => {
            expect(render(COLORED, { isPreview: true })).toBe(`→${HIGH_256}100.0%${FG_RESET}`);
        });

        it('offers (v), names it on the editor row, opens its editor and colors around its value', () => {
            const widget = new BlockForecastWidget();
            const editorProps = { widget: COLORED, onComplete: () => undefined, onCancel: () => undefined };

            expect(widget.getCustomKeybinds(COLORED).map(keybind => keybind.key)).toContain('v');
            expect(widget.getEditorDisplay(COLORED).modifierText).toBe('(used, value colors)');
            expect(widget.renderEditor({ ...editorProps, action: 'edit-value-colors' })).toBeTruthy();
            expect(widget.colorsOnlyItsRuns(COLORED)).toBe(true);
            expect(widget.colorsOnlyItsRuns(ITEM)).toBe(false);
        });

        // With a label override: the shared checks sweep a gradient across the
        // label, which needs more than the default arrow's one character
        describeValueColorsOnTheLine({
            item: { ...ITEM, metadata: { ...BAND_COLORS, label: 'Forecast: ' } },
            context: live(42, 83.2),
            label: 'Forecast: ',
            value: '83.2%',
            valueCode: MID,
            fallbacks: []
        });
    });
});
