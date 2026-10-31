import type { ColorLevelString } from '../../types/ColorLevel';
import {
    getColorAnsiCode,
    restoreForegroundAfterRuns
} from '../../utils/colors';

// For widgets that color parts of their own text. Each part restores only the
// default foreground, so Powerline backgrounds survive, and the renderer turns
// that back into the widget's own color. A run already colored inside the
// text, such as a cell bar's gray empty cells, returns to this part's color.
export function paintCode(text: string, code: string): string {
    return text && code ? `${code}${restoreForegroundAfterRuns(text, code)}\x1b[39m` : text;
}

export function paintForeground(text: string, color: string, colorLevel: ColorLevelString): string {
    return paintCode(text, getColorAnsiCode(color, colorLevel));
}
