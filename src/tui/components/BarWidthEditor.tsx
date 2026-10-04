import {
    Box,
    Text,
    useInput
} from 'ink';
import React, { useState } from 'react';

import type { WidgetItem } from '../../types/Widget';
import {
    MIN_BAR_CELLS,
    formatBarWidth,
    getBarWidth,
    setBarWidth,
    stepBarWidth
} from '../../widgets/shared/bar-width';

export interface BarWidthEditorProps {
    widget: WidgetItem;
    // Called with the widget at each width tried, so the preview can show it
    onChange: (draft: WidgetItem) => void;
    onComplete: (updatedWidget: WidgetItem) => void;
    onCancel: () => void;
}

export const BarWidthEditor: React.FC<BarWidthEditorProps> = ({ widget, onChange, onComplete, onCancel }) => {
    const [width, setWidth] = useState(() => getBarWidth(widget));

    useInput((_input, key) => {
        if (key.return) {
            onComplete(setBarWidth(widget, width));
        } else if (key.escape) {
            onCancel();
        } else if (key.leftArrow || key.rightArrow) {
            const next = stepBarWidth(width, key.leftArrow ? -1 : 1);
            setWidth(next);
            onChange(setBarWidth(widget, next));
        }
    });

    return (
        <Box flexDirection='column'>
            <Text bold>Bar width</Text>
            <Text dimColor>←→ adjust, Enter save, ESC cancel</Text>
            <Box marginTop={1}>
                <Text color='green'>{`◀ ${formatBarWidth(width)} ▶`}</Text>
            </Box>
            <Box marginTop={1} flexDirection='column'>
                <Text dimColor>default keeps the display mode's own size.</Text>
                <Text dimColor>A percentage asks for that share of the status line's width.</Text>
                <Text dimColor>fill takes all the room the rest of the line leaves.</Text>
                <Text dimColor>{`Bars shrink to fit the terminal, down to ${MIN_BAR_CELLS} cells.`}</Text>
            </Box>
        </Box>
    );
};
