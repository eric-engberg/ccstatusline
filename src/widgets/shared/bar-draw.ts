import type { Settings } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';

import {
    getBarCellGlyph,
    getBarStyle
} from './bar-layout';
import {
    getBarPaintPreset,
    paintBarCells,
    type BarGlyphs,
    type BarPaint
} from './gradient-bar';
import { layoutBar } from './progress-bar';

const BLOCK_GLYPHS: BarGlyphs = { filled: '█', empty: '░' };
const SLIDER_GLYPHS: BarGlyphs = { filled: '▓', empty: '░' };

export interface DrawBarOptions {
    // Where the time cursor sits, as a percent of the bar
    cursorPercent?: number;
    // The bar fills with what's left, so a gradient runs from its urgent end
    // and the color where the fill ends still shows how urgent things are
    reversed?: boolean;
}

// A cell bar's empty cells look as they would filled, but faint, so the fill
// shows on a dark background or a light one. Not at the No Color level, where
// the bar has no styling, or on a dimmed widget, whose text is all faint
// already. Ending faint ends bold too, so a bold widget's bar turns it back on.
function getFaintEmpty(item: WidgetItem, settings: Settings): BarPaint['faintEmpty'] {
    if (settings.colorLevel === 0 || item.dim === true) {
        return undefined;
    }
    return { bold: Boolean(settings.globalBold || item.bold) };
}

// The widget's bar in its style, e.g. "[████░░░░]", "▓▓▓▓░░░░" or "▮▮▮▮▮▮▮▮",
// with the given number of cells, the first percent of them filled, and
// painted with the widget's gradient preset where the settings allow it. A cell
// bar draws its filled and empty cells alike, so its empty ones are faint.
export function drawWidgetBar(item: WidgetItem, percent: number, cellCount: number, settings: Settings, options: DrawBarOptions = {}): string {
    const style = getBarStyle(item) ?? 'block';
    const cells = layoutBar(percent, cellCount, options);
    const preset = getBarPaintPreset(item, settings);
    if (style === 'cells') {
        const glyph = getBarCellGlyph(item);
        return paintBarCells(cells, { filled: glyph, empty: glyph }, { preset, reversed: options.reversed, faintEmpty: getFaintEmpty(item, settings) });
    }
    const bar = paintBarCells(cells, style === 'block' ? BLOCK_GLYPHS : SLIDER_GLYPHS, { preset, reversed: options.reversed });
    return style === 'block' ? `[${bar}]` : bar;
}
