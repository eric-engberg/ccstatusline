import type { Settings } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';

import {
    getBarStyle,
    type BarStyle
} from './bar-layout';
import {
    getBarPaintPreset,
    paintBarCells,
    type BarGlyphs
} from './gradient-bar';
import { layoutBar } from './progress-bar';

const BAR_GLYPHS: Record<BarStyle, BarGlyphs> = {
    block: { filled: '█', empty: '░' },
    slider: { filled: '▓', empty: '░' }
};

export interface DrawBarOptions {
    // Where the time cursor sits, as a percent of the bar
    cursorPercent?: number;
    // The bar fills with what's left, so a gradient runs from its urgent end
    // and the color where the fill ends still shows how urgent things are
    reversed?: boolean;
}

// The widget's bar in its style, e.g. "[████░░░░]" or "▓▓▓▓░░░░", with the
// given number of cells, the first percent of them filled, and painted with
// the widget's gradient preset where the settings allow it
export function drawWidgetBar(item: WidgetItem, percent: number, cellCount: number, settings: Settings, options: DrawBarOptions = {}): string {
    const style = getBarStyle(item) ?? 'block';
    const cells = layoutBar(percent, cellCount, options);
    const bar = paintBarCells(cells, BAR_GLYPHS[style], { preset: getBarPaintPreset(item, settings), reversed: options.reversed });
    return style === 'block' ? `[${bar}]` : bar;
}
