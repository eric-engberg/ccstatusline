import type { Settings } from '../types/Settings';
import type { WidgetItem } from '../types/Widget';

import { isPowerlineLine } from './powerline-lines';
import { advanceGlobalPowerlineThemeIndex } from './powerline-theme-index';
import {
    countPowerlineStartCapSlots,
    type PreRenderedWidget
} from './renderer';
import { advanceGlobalSeparatorIndex } from './separator-index';

// Where each line starts in the cycles of separators, theme colors and start
// caps that run across the status lines
export interface LineCounters {
    separator: number;
    theme: number;
    startCap: number;
}

export const START_LINE_COUNTERS: LineCounters = { separator: 0, theme: 0, startCap: 0 };

/**
 * The counters for the line after this one. Separators, theme colors and caps
 * belong to Powerline lines, so a plain line leaves them where they were.
 */
export function advanceLineCounters(
    counters: LineCounters,
    settings: Settings,
    lineIndex: number,
    lineItems: WidgetItem[],
    preRenderedWidgets: PreRenderedWidget[]
): LineCounters {
    if (!isPowerlineLine(settings, lineIndex)) {
        return counters;
    }
    return {
        separator: advanceGlobalSeparatorIndex(counters.separator, lineItems, preRenderedWidgets),
        theme: settings.powerline.continueThemeAcrossLines
            ? advanceGlobalPowerlineThemeIndex(counters.theme, preRenderedWidgets)
            : counters.theme,
        startCap: counters.startCap + countPowerlineStartCapSlots(lineItems, preRenderedWidgets)
    };
}
