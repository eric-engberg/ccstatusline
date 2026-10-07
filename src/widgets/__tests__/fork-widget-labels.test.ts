import {
    describe,
    expect,
    it
} from 'vitest';

import { DEFAULT_SETTINGS } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import { getWidget } from '../../utils/widgets';

// The widgets this fork adds, beside the ones #601 covers
describe.each([
    ['extra-usage-today', 'Overage Today: '],
    ['extra-usage-daily-budget', 'Daily Budget: '],
    ['extra-usage-limit', 'Overage Limit: '],
    ['session-cost-rate', 'Rate: '],
    ['daily-cost-rate', 'Rate Today: ']
])('%s label', (type, defaultLabel) => {
    const widget = getWidget(type);
    const item: WidgetItem = { id: 'w', type };
    const preview = (target: WidgetItem) => widget?.render(target, { isPreview: true }, DEFAULT_SETTINGS) ?? '';

    it('offers its default label to the label editor', () => {
        expect(widget?.getLabelPrefix?.(item)).toBe(defaultLabel);
        expect(preview(item).startsWith(defaultLabel)).toBe(true);
    });

    it('draws an edited label, or none', () => {
        expect(preview({ ...item, metadata: { label: 'x ' } }).startsWith('x ')).toBe(true);
        expect(preview({ ...item, metadata: { label: '' } }).startsWith(defaultLabel)).toBe(false);
    });
});

// A line like "today: $12.34 of $50.00/day", without raw values. With value
// colors on, the widget paints only the value and the renderer colors the
// label (colorsOnlyItsRuns), so the label comes out unpainted here
it('draws an edited label on Extra Usage Today with its value colors on', () => {
    const today = getWidget('extra-usage-today');
    const item: WidgetItem = { id: 't', type: 'extra-usage-today', color: 'hex:112233', metadata: { valueColors: 'true', label: 'today: ' } };

    expect(today?.colorsOnlyItsRuns?.(item)).toBe(true);
    expect(today?.render(item, { isPreview: true }, DEFAULT_SETTINGS)).toMatch(/^today: \$/);
});
