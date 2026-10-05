import {
    Box,
    Text,
    useInput
} from 'ink';
import React, { useState } from 'react';

import type { WidgetItem } from '../../types/Widget';
import { setBarSize } from '../../widgets/shared/bar-layout';
import {
    MIN_BAR_CELLS,
    formatBarSize,
    getBarSize,
    stepBarSize
} from '../../widgets/shared/bar-width';

export interface BarWidthEditorProps {
    widget: WidgetItem;
    // Called with the widget at each width tried, so the preview can show it
    onChange: (draft: WidgetItem) => void;
    onComplete: (updatedWidget: WidgetItem) => void;
    onCancel: () => void;
}

export const BarWidthEditor: React.FC<BarWidthEditorProps> = ({ widget, onChange, onComplete, onCancel }) => {
    const [size, setSize] = useState(() => getBarSize(widget));

    useInput((_input, key) => {
        if (key.return) {
            // Unchanged, it stores nothing new
            onComplete(size === getBarSize(widget) ? widget : setBarSize(widget, size));
        } else if (key.escape) {
            onCancel();
        } else if (key.leftArrow || key.rightArrow) {
            const next = stepBarSize(size, key.leftArrow ? -1 : 1);
            setSize(next);
            onChange(setBarSize(widget, next));
        }
    });

    return (
        <Box flexDirection='column'>
            <Text bold>Bar size</Text>
            <Text dimColor>←→ adjust, Enter save, ESC cancel</Text>
            <Box marginTop={1}>
                <Text color='green'>{`◀ ${formatBarSize(size)} ▶`}</Text>
            </Box>
            <Box marginTop={1} flexDirection='column'>
                <Text dimColor>short, medium and long are 10, 16 and 32 cells.</Text>
                <Text dimColor>A percentage asks for that share of the status line's width.</Text>
                <Text dimColor>fill takes all the room the rest of the line leaves.</Text>
                <Text dimColor>{`Bars shrink to fit the terminal, down to ${MIN_BAR_CELLS} cells.`}</Text>
            </Box>
        </Box>
    );
};
