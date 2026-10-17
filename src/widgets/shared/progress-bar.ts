export interface TimerProgressBarOptions { cursorPercent?: number }

// What each of a bar's cells shows: part of the fill, the empty rest, or the
// time cursor, which takes the place of the cell at its position
export type BarCell = 'filled' | 'empty' | 'cursor';

// The first percent of the cells are filled, rounded to the nearest cell
export function layoutBar(
    percent: number,
    width: number,
    options?: TimerProgressBarOptions
): BarCell[] {
    const clampedPercent = Math.max(0, Math.min(100, percent));
    const filledWidth = Math.round((clampedPercent / 100) * width);

    const cursorPos = options?.cursorPercent !== undefined
        ? Math.min(Math.floor((Math.max(0, Math.min(100, options.cursorPercent)) / 100) * width), width - 1)
        : -1;

    const cells: BarCell[] = [];
    for (let i = 0; i < width; i++) {
        if (i === cursorPos) {
            cells.push('cursor');
        } else if (i < filledWidth) {
            cells.push('filled');
        } else {
            cells.push('empty');
        }
    }

    return cells;
}

const BLOCK_CELL_GLYPHS: Record<BarCell, string> = { filled: '█', empty: '░', cursor: '│' };

export function makeTimerProgressBar(
    percent: number,
    width: number,
    options?: TimerProgressBarOptions
): string {
    return layoutBar(percent, width, options).map(cell => BLOCK_CELL_GLYPHS[cell]).join('');
}
