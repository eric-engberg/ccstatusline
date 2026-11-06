import {
    Box,
    Text,
    useInput
} from 'ink';
import React, { useState } from 'react';

import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    HideableState,
    Widget,
    WidgetEditorDisplay,
    WidgetEditorProps,
    WidgetItem
} from '../types/Widget';

import { GlyphPicker } from './shared/glyph-picker';
import { MERGE_TARGET_HIDDEN_HIDEABLE_STATE } from './shared/hideable';
import { useTextCursor } from './shared/text-cursor';

export class CustomTextWidget implements Widget {
    getDefaultColor(): string { return 'white'; }
    getDescription(): string { return 'Displays user-defined custom text'; }
    getDisplayName(): string { return 'Custom Text'; }
    getCategory(): string { return 'Custom'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const text = item.customText ?? 'Empty';
        return { displayText: `${this.getDisplayName()} (${text})` };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        return item.customText ?? '';
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [{
            key: 'e',
            label: '(e)dit text',
            action: 'edit-text'
        }];
    }

    // The actual hiding happens in the renderer, which resolves the merge
    // target's rendered output (see applyMergeTargetHiding)
    getHideableStates(): HideableState[] {
        return [MERGE_TARGET_HIDDEN_HIDEABLE_STATE];
    }

    renderEditor(props: WidgetEditorProps): React.ReactElement {
        return <CustomTextEditor {...props} />;
    }

    supportsRawValue(): boolean { return false; }
    supportsColors(item: WidgetItem): boolean { return true; }
}

const CustomTextEditor: React.FC<WidgetEditorProps> = ({ widget, onComplete, onCancel }) => {
    const { getText, display, handleInput, insert } = useTextCursor(widget.customText ?? '');
    const [picking, setPicking] = useState(false);

    // The picker takes the keys while it's open
    useInput((input, key) => {
        if (key.downArrow) {
            setPicking(true);
        } else if (key.return) {
            onComplete({ ...widget, customText: getText() });
        } else if (key.escape) {
            onCancel();
        } else {
            handleInput(input, key);
        }
    }, { isActive: !picking });

    if (picking) {
        return (
            <GlyphPicker
                initialGlyph=''
                onPick={(glyph) => {
                    insert(glyph);
                    setPicking(false);
                }}
                onCancel={() => { setPicking(false); }}
            />
        );
    }

    return (
        <Box flexDirection='column'>
            <Text>{`Enter custom text: ${display}`}</Text>
            <Text dimColor>←→ move cursor, ↓ pick a glyph, Ctrl+←→ jump to start/end, Enter save, ESC cancel</Text>
        </Box>
    );
};
