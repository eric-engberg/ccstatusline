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
import { makeUsageProgressBar } from '../../utils/usage';
import { ContextBarWidget } from '../ContextBar';

const GREEN_TRUECOLOR = '\x1b[38;2;0;200;80m';

const context: RenderContext = {
    data: {
        context_window: {
            context_window_size: 200000,
            current_usage: {
                input_tokens: 90000,
                output_tokens: 10000,
                cache_creation_input_tokens: 5000,
                cache_read_input_tokens: 5000
            }
        }
    }
};
const plainBar: WidgetItem = { id: 'ctx', type: 'context-bar' };
const gradientBar: WidgetItem = { ...plainBar, metadata: { gradient: 'true' } };
const truecolor: Settings = { ...DEFAULT_SETTINGS, colorLevel: 3 };

describe('ContextBarWidget gradient', () => {
    const widget = new ContextBarWidget();

    it('toggles with (g)', () => {
        expect(widget.getCustomKeybinds().some(keybind => keybind.key === 'g' && keybind.action === 'toggle-gradient')).toBe(true);

        const on = widget.handleEditorAction('toggle-gradient', plainBar);
        expect(on?.metadata?.gradient).toBe('true');
        expect(widget.getEditorDisplay(on ?? plainBar).modifierText).toContain('gradient');

        const off = widget.handleEditorAction('toggle-gradient', on ?? plainBar);
        expect(off?.metadata?.gradient).not.toBe('true');
        expect(widget.getEditorDisplay(off ?? plainBar).modifierText ?? '').not.toContain('gradient');
    });

    it('is off by default and renders exactly as before', () => {
        expect(widget.render(plainBar, context, truecolor)).toBe(`Context: ${makeUsageProgressBar(50, 16)} 100k/200k (50%)`);
    });

    it('colors only the bar, leaving the text unchanged', () => {
        const painted = widget.render(gradientBar, context, truecolor) ?? '';
        expect(painted).toContain(GREEN_TRUECOLOR);
        expect(stripAnsi(painted)).toBe(widget.render(plainBar, context, truecolor));
        // Text after the bar returns to the widget's own color
        expect(painted).toMatch(/\x1b\[39m\] 100k\/200k \(50%\)$/);
    });

    it('colors the bar in every bar style', () => {
        for (const display of ['progress', 'slider', 'slider-only']) {
            const item = { ...gradientBar, metadata: { ...gradientBar.metadata, display } };
            expect(widget.render(item, context, truecolor)).toContain(GREEN_TRUECOLOR);
        }
    });

    it('shows the gradient in the TUI preview too', () => {
        expect(widget.render(gradientBar, { isPreview: true }, truecolor)).toContain(GREEN_TRUECOLOR);
    });

    it('stays plain with colors off or a global foreground override', () => {
        expect(widget.render(gradientBar, context, { ...truecolor, colorLevel: 0 })).not.toContain('\x1b[');
        expect(widget.render(gradientBar, context, { ...truecolor, overrideForegroundColor: 'white' })).not.toContain('\x1b[');
    });
});
