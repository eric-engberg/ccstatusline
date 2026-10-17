import { getColorLevelString } from '../../types/ColorLevel';
import type { Settings } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';

import {
    getBarCellGlyph,
    getBarEmptyCells,
    getBarStyle
} from './bar-layout';
import {
    getBarPaintPreset,
    getEmptyCellCode,
    overridesForeground,
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
// shows on a dark background or a light one; or, when chosen, dark gray, which
// stands out more on a dark background but matches dark text on a light one.
// No styling at the No Color level. Gray is a foreground, which a global
// foreground override owns, so there the empty cells stay faint. Faint adds
// nothing to a dimmed widget, whose text is all faint already, while gray still
// shows there. Ending faint ends bold too, so a bold widget's bar turns it back on.
function getEmptyCellPaint(item: WidgetItem, settings: Settings): Pick<BarPaint, 'emptyCode' | 'faintEmpty'> {
    if (settings.colorLevel === 0) {
        return {};
    }
    if (getBarEmptyCells(item) === 'gray' && !overridesForeground(settings)) {
        return { emptyCode: getEmptyCellCode(getColorLevelString(settings.colorLevel)) };
    }
    return item.dim === true ? {} : { faintEmpty: { bold: Boolean(settings.globalBold || item.bold) } };
}

// The widget's bar in its style, e.g. "[████░░░░]", "▓▓▓▓░░░░" or "▮▮▮▮▮▮▮▮",
// with the given number of cells, the first percent of them filled, and
// painted with the widget's gradient preset where the settings allow it. A cell
// bar draws its filled and empty cells alike, so its empty ones are faint or gray.
export function drawWidgetBar(item: WidgetItem, percent: number, cellCount: number, settings: Settings, options: DrawBarOptions = {}): string {
    const style = getBarStyle(item) ?? 'block';
    const cells = layoutBar(percent, cellCount, options);
    const preset = getBarPaintPreset(item, settings);
    if (style === 'cells') {
        const glyph = getBarCellGlyph(item);
        return paintBarCells(cells, { filled: glyph, empty: glyph }, { preset, reversed: options.reversed, ...getEmptyCellPaint(item, settings) });
    }
    const bar = paintBarCells(cells, style === 'block' ? BLOCK_GLYPHS : SLIDER_GLYPHS, { preset, reversed: options.reversed });
    return style === 'block' ? `[${bar}]` : bar;
}
