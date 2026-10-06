import stripAnsi from 'strip-ansi';
import {
    describe,
    expect,
    it
} from 'vitest';

import type { RenderContext } from '../../types';
import {
    DEFAULT_SETTINGS,
    type Settings
} from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import { getWidget } from '../../utils/widgets';

const truecolor: Settings = { ...DEFAULT_SETTINGS, colorLevel: 3 };
const color256: Settings = { ...DEFAULT_SETTINGS, colorLevel: 2 };
const preview: RenderContext = { isPreview: true };
const TRAFFIC_CALM = '\x1b[38;2;0;200;80m';
const TRAFFIC_URGENT = '\x1b[38;2;220;40;20m';

interface BarWidgetCase {
    type: string;
    // Metadata that makes the widget show a bar
    bar: Record<string, string>;
    // Metadata that makes the bar fill with what's left, if the widget has it
    inverted?: Record<string, string>;
}

const usageInverted = { invert: 'true' };
const cases: BarWidgetCase[] = [
    { type: 'context-bar', bar: { display: 'progress' } },
    { type: 'context-percentage', bar: { display: 'slider' }, inverted: { inverse: 'true' } },
    { type: 'context-percentage-usable', bar: { display: 'slider' }, inverted: { inverse: 'true' } },
    { type: 'session-usage', bar: { display: 'progress' }, inverted: usageInverted },
    { type: 'weekly-usage', bar: { display: 'progress' }, inverted: usageInverted },
    { type: 'weekly-sonnet-usage', bar: { display: 'progress' }, inverted: usageInverted },
    { type: 'weekly-opus-usage', bar: { display: 'progress' }, inverted: usageInverted },
    { type: 'fable-weekly-usage', bar: { display: 'progress' }, inverted: usageInverted },
    { type: 'extra-usage-utilization', bar: { display: 'progress' }, inverted: usageInverted },
    { type: 'block-timer', bar: { display: 'progress' }, inverted: usageInverted },
    { type: 'reset-timer', bar: { display: 'progress' }, inverted: usageInverted },
    { type: 'weekly-reset-timer', bar: { display: 'progress' }, inverted: usageInverted }
];

function firstColor(text: string | null): string | undefined {
    return /\x1b\[38;2;[0-9;]+m/.exec(text ?? '')?.[0];
}

describe.each(cases)('$type bar gradient', ({ type, bar, inverted }) => {
    const widget = getWidget(type);
    if (!widget) {
        throw new Error(`no widget registered for ${type}`);
    }
    const plain: WidgetItem = { id: 'w', type, metadata: bar };
    const withGradient: WidgetItem = { id: 'w', type, metadata: { ...bar, gradient: 'traffic' } };
    const render = (item: WidgetItem, settings: Settings) => widget.render(item, preview, settings);

    it('paints the bar in true RGB, changing only its colors', () => {
        const painted = render(withGradient, truecolor);
        expect(firstColor(painted)).toBe(TRAFFIC_CALM);
        expect(stripAnsi(painted ?? '')).toBe(stripAnsi(render(plain, truecolor) ?? ''));
    });

    it('stays plain below truecolor', () => {
        expect(render(withGradient, color256)).toBe(render(plain, color256));
    });

    it('offers (g) while it shows a bar', () => {
        const offersGradient = (item: WidgetItem) => (widget.getCustomKeybinds?.(item) ?? []).some(keybind => keybind.key === 'g');
        expect(offersGradient(plain)).toBe(true);
        if (type !== 'context-bar') {
            expect(offersGradient({ id: 'w', type })).toBe(false);
        }
    });

    it('cycles to a preset with (g) and names it in the line editor', () => {
        expect(widget.handleEditorAction?.('cycle-gradient', plain)?.metadata?.gradient).toBe('traffic');
        expect(widget.getEditorDisplay(withGradient).modifierText).toContain('gradient: traffic');
    });

    if (inverted) {
        it('starts from the urgent end when the bar fills with what is left', () => {
            const invertedBar: WidgetItem = { id: 'w', type, metadata: { ...bar, ...inverted, gradient: 'traffic' } };
            expect(firstColor(render(invertedBar, truecolor))).toBe(TRAFFIC_URGENT);
        });
    }
});
