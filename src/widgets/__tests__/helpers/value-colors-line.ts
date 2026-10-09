import {
    describe,
    expect,
    it
} from 'vitest';

import type { RenderContext } from '../../../types/RenderContext';
import {
    DEFAULT_SETTINGS,
    type Settings
} from '../../../types/Settings';
import type { WidgetItem } from '../../../types/Widget';
import {
    calculateMaxWidthsFromPreRendered,
    preRenderAllWidgets,
    renderStatusLine
} from '../../../utils/renderer';

/** The widget alone on a status line, without padding. */
export function renderWidgetLine(item: WidgetItem, settings: Partial<Settings>, context: RenderContext): string {
    const fullSettings: Settings = { ...DEFAULT_SETTINGS, defaultPadding: '', ...settings };
    const lineContext: RenderContext = { isPreview: false, terminalWidth: 0, ...context };
    const preRenderedLines = preRenderAllWidgets([[item]], fullSettings, lineContext);
    const maxWidths = calculateMaxWidthsFromPreRendered(preRenderedLines, fullSettings);
    return renderStatusLine([item], fullSettings, lineContext, preRenderedLines[0] ?? [], maxWidths);
}

const FG_RESET = '\x1b[39m';
const BASE = '\x1b[38;2;17;34;51m';
const NORD: Partial<Settings> = {
    colorLevel: 2,
    powerline: { ...DEFAULT_SETTINGS.powerline, enabled: true, theme: 'nord' }
};
// nord's first segment at 256 colors: text 16 on background 73
const NORD_TEXT = '\x1b[38;5;16m';
const NORD_SEGMENT = `${NORD_TEXT}\x1b[48;5;73m`;
const NORD_END = '\x1b[49m';

export interface ValueColorsLineCase {
    /** The widget with value colors on, in custom colors, and no color of its own. */
    item: WidgetItem;
    /** Data the widget shows its value for. */
    context: RenderContext;
    label: string;
    value: string;
    /** The value's color, the same at 256 colors and truecolor (a custom color). */
    valueCode: string;
    /** What the widget shows with no value to color, e.g. "n/a" or a usage error. */
    fallbacks: { context: RenderContext; text: string }[];
}

// With value colors on, the widget paints only its value, or its whole text
// with the whole widget colored, and the renderer colors the rest the way it
// colors any widget (Widget.colorsOnlyItsRuns)
export function describeValueColorsOnTheLine(line: ValueColorsLineCase): void {
    const { item, context, label, value, valueCode } = line;
    const wholeWidget: WidgetItem = { ...item, metadata: { ...item.metadata, valueColorScope: 'widget' } };

    describe('value colors on the status line', () => {
        it('draws the label in the Powerline theme\'s text color', () => {
            expect(renderWidgetLine(item, NORD, context)).toBe(`${NORD_SEGMENT}${label}${valueCode}${value}${NORD_TEXT}${NORD_END}${FG_RESET}`);
        });

        it('draws the label in the item color', () => {
            expect(renderWidgetLine({ ...item, color: 'hex:112233' }, { colorLevel: 3 }, context))
                .toBe(`${BASE}${label}${valueCode}${value}${BASE}${FG_RESET}`);
        });

        it('leaves the label in the terminal\'s color when the item color is "Default"', () => {
            expect(renderWidgetLine({ ...item, color: '' }, { colorLevel: 3 }, context)).toBe(`${label}${valueCode}${value}${FG_RESET}`);
        });

        it('sweeps an item gradient across the label and keeps the value color', () => {
            const rendered = renderWidgetLine({ ...item, color: 'gradient:atlas' }, { colorLevel: 3 }, context);
            const labelEnd = label.slice(label.trimEnd().length - 1);

            // atlas runs #feac5e to #4bc0c8 across the label, the text it colors
            expect(rendered.startsWith(`\x1b[38;2;254;172;94m${label.charAt(0)}`)).toBe(true);
            expect(rendered).toContain(`\x1b[38;2;75;192;200m${labelEnd}${valueCode}${value}${FG_RESET}`);
        });

        it('colors the label with the value when set to the whole widget', () => {
            expect(renderWidgetLine(wholeWidget, NORD, context)).toBe(`${NORD_SEGMENT}${valueCode}${label}${value}${NORD_TEXT}${NORD_END}${FG_RESET}`);
            expect(renderWidgetLine({ ...wholeWidget, color: 'hex:112233' }, { colorLevel: 3 }, context))
                .toBe(`${BASE}${valueCode}${label}${value}${BASE}${FG_RESET}`);
        });

        it('draws text with no value to color in the theme or item color', () => {
            for (const fallback of line.fallbacks) {
                expect(renderWidgetLine(item, NORD, fallback.context)).toBe(`${NORD_SEGMENT}${fallback.text}${NORD_END}${FG_RESET}`);
                expect(renderWidgetLine({ ...item, color: 'hex:112233' }, { colorLevel: 3 }, fallback.context))
                    .toBe(`${BASE}${fallback.text}${FG_RESET}`);
            }
        });

        it('gives way to a global foreground override', () => {
            expect(renderWidgetLine(item, { colorLevel: 3, overrideForegroundColor: 'hex:AABBCC' }, context))
                .toBe(`\x1b[38;2;170;187;204m${label}${value}${FG_RESET}`);
        });

        it('colors nothing at the No Color level', () => {
            expect(renderWidgetLine(item, { colorLevel: 0 }, context)).toBe(`${label}${value}`);
        });
    });
}
