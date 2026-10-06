export interface ListWindow {
    start: number;
    end: number;
    hiddenAbove: number;
    hiddenBelow: number;
}

// Rows the picker screen uses besides the list and the status line preview
// lines: title, preview box, editor header, search line, description and the
// two "more" markers (14), plus slack for lines that wrap on narrow terminals
const PICKER_RESERVED_ROWS = 16;
const MIN_VISIBLE_ENTRIES = 3;
const DEFAULT_VISIBLE_ENTRIES = 10;

// Keeps the selection centered once the list scrolls, so the entries on both
// sides of it stay visible
export function getListWindow(total: number, selectedIndex: number, maxVisible: number): ListWindow {
    if (total <= maxVisible) {
        return { start: 0, end: total, hiddenAbove: 0, hiddenBelow: 0 };
    }

    const start = Math.min(
        Math.max(0, selectedIndex - Math.floor(maxVisible / 2)),
        total - maxVisible
    );
    const end = start + maxVisible;
    return { start, end, hiddenAbove: start, hiddenBelow: total - end };
}

// Sized so the whole picker screen fits in the terminal; a taller screen
// scrolls the status line preview off the top while picking
export function getPickerMaxVisible(terminalRows: number | undefined, statusLineCount: number): number {
    if (!terminalRows) {
        return DEFAULT_VISIBLE_ENTRIES;
    }

    return Math.max(MIN_VISIBLE_ENTRIES, terminalRows - PICKER_RESERVED_ROWS - statusLineCount);
}
