import {
    Box,
    Text,
    useInput
} from 'ink';
import React, { useState } from 'react';

import type { WidgetItem } from '../../types/Widget';
import { GlyphPicker } from '../../widgets/shared/glyph-picker';
import {
    clearLabel,
    getLabel,
    setLabel
} from '../../widgets/shared/raw-or-labeled';
import { useTextCursor } from '../../widgets/shared/text-cursor';

export interface LabelEditorProps {
    widget: WidgetItem;
    defaultLabel: string;
    onComplete: (updatedWidget: WidgetItem) => void;
    onCancel: () => void;
    onPreview?: (updatedWidget: WidgetItem) => void;
}

export const LabelEditor: React.FC<LabelEditorProps> = ({ widget, defaultLabel, onComplete, onCancel, onPreview }) => {
    const { getText, display, handleInput, insert } = useTextCursor(getLabel(widget, defaultLabel));
    const [picking, setPicking] = useState(false);

    // Typed or picked, every change to the text shows in the preview
    const editText = (edit: () => void) => {
        const previousText = getText();
        edit();
        if (getText() !== previousText) {
            onPreview?.(setLabel(widget, getText()));
        }
    };

    // The picker takes the keys while it's open
    useInput((input, key) => {
        if (key.downArrow) {
            setPicking(true);
        } else if (key.return) {
            onComplete(setLabel(widget, getText()));
        } else if (key.escape) {
            onCancel();
        } else if (key.tab) {
            onComplete(clearLabel(widget));
        } else {
            editText(() => { handleInput(input, key); });
        }
    }, { isActive: !picking });

    if (picking) {
        return (
            <GlyphPicker
                initialGlyph=''
                onPick={(glyph) => {
                    editText(() => { insert(glyph); });
                    setPicking(false);
                }}
                onCancel={() => { setPicking(false); }}
            />
        );
    }

    // Quoted so trailing spaces, which usually separate the label from the
    // value, stay visible. One Text, because Ink measures a toned or joined
    // emoji as several columns and a sibling Text would overwrite its end.
    return (
        <Box flexDirection='column'>
            <Text bold>Label</Text>
            <Text dimColor>←→ move cursor, ↓ pick a glyph, Ctrl+←→ jump to start/end, Tab reset to default, Enter save, ESC cancel</Text>
            <Box marginTop={1}>
                <Text>
                    {`"${display}"`}
                    <Text dimColor>{` (default: ${JSON.stringify(defaultLabel)})`}</Text>
                </Text>
            </Box>
        </Box>
    );
};
