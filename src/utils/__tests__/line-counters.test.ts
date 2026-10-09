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
    START_LINE_COUNTERS,
    advanceLineCounters
} from '../line-counters';
import type { PreRenderedWidget } from '../renderer';

const items: WidgetItem[] = [
    { id: 'a', type: 'custom-text', customText: 'a' },
    { id: 'b', type: 'custom-text', customText: 'b' },
    { id: 'c', type: 'custom-text', customText: 'c' }
];
const preRendered: PreRenderedWidget[] = items.map(widget => ({ content: widget.customText ?? '', plainLength: 1, widget }));

function settingsWith(enabled: boolean, lineEnabled?: (boolean | null)[]): Settings {
    return {
        ...DEFAULT_SETTINGS,
        lines: [items, items],
        powerline: { ...DEFAULT_SETTINGS.powerline, enabled, continueThemeAcrossLines: true, startCaps: ['<'], lineEnabled }
    };
}

// Separators, theme colors and caps belong to Powerline lines, so a plain line
// in between leaves them where they were
describe('advanceLineCounters', () => {
    it('advances the separator, theme and cap counters past a Powerline line', () => {
        const next = advanceLineCounters(START_LINE_COUNTERS, settingsWith(true), 0, items, preRendered);

        expect(next).toEqual({ separator: 2, theme: 3, startCap: 1 });
    });

    it('leaves them alone past a plain line', () => {
        expect(advanceLineCounters(START_LINE_COUNTERS, settingsWith(true, [false]), 0, items, preRendered)).toEqual(START_LINE_COUNTERS);
        expect(advanceLineCounters(START_LINE_COUNTERS, settingsWith(false), 0, items, preRendered)).toEqual(START_LINE_COUNTERS);
    });

    it('keeps theme colors per line unless they continue across lines', () => {
        const settings = settingsWith(true);
        const perLine = { ...settings, powerline: { ...settings.powerline, continueThemeAcrossLines: false } };

        expect(advanceLineCounters(START_LINE_COUNTERS, perLine, 0, items, preRendered).theme).toBe(0);
    });
});
