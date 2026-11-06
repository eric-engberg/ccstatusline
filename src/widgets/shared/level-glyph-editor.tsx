import {
    Box,
    Text,
    useInput,
    type Key
} from 'ink';
import React, { useState } from 'react';

import type { WidgetEditorProps } from '../../types/Widget';
import {
    getPlainInput,
    shouldInsertInput
} from '../../utils/input-guards';

import {
    EDIT_LEVELS_ACTION,
    LEVEL_BREAK_POINTS,
    formatLevelSample,
    getLevelBreakPointLabel,
    getLevelBreakPoints,
    getLevelGlyphSlots,
    stepLevelBreakPoint,
    typeLevelBreakPoint
} from './level-glyph';
import {
    SYMBOL_OVERRIDE_ACTION,
    renderSymbolSlotsEditor
} from './symbol-override';

interface TypedInput {
    text: string;
    error: string | null;
}

// The three break points between the four glyph levels
const LevelBreakPointsEditor: React.FC<WidgetEditorProps> = ({ widget, onComplete, onCancel }) => {
    const [draft, setDraft] = useState(widget);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [input, setInput] = useState<TypedInput | null>(null);
    const point = LEVEL_BREAK_POINTS[selectedIndex] ?? 'medium';
    const points = getLevelBreakPoints(draft);

    // Keys while a number is being typed
    const handleTypedInput = (inputChar: string, key: Key, current: TypedInput) => {
        if (key.escape) {
            setInput(null);
        } else if (key.return) {
            const result = typeLevelBreakPoint(draft, point, current.text);
            if (typeof result === 'string') {
                setInput({ text: current.text, error: result });
            } else {
                setDraft(result);
                setInput(null);
            }
        } else if (key.backspace || key.delete) {
            setInput({ text: current.text.slice(0, -1), error: null });
        } else if (shouldInsertInput(inputChar, key)) {
            setInput({ text: current.text + inputChar, error: null });
        }
    };

    useInput((inputChar, key) => {
        if (input !== null) {
            handleTypedInput(inputChar, key, input);
            return;
        }

        const shortcut = getPlainInput(inputChar, key);
        if (key.return) {
            onComplete(draft);
        } else if (key.escape) {
            onCancel();
        } else if (key.upArrow || key.downArrow) {
            const direction = key.downArrow ? 1 : -1;
            setSelectedIndex((selectedIndex + direction + LEVEL_BREAK_POINTS.length) % LEVEL_BREAK_POINTS.length);
        } else if (key.leftArrow || key.rightArrow) {
            setDraft(stepLevelBreakPoint(draft, point, key.rightArrow ? 1 : -1));
        } else if (/^\d$/.test(shortcut)) {
            setInput({ text: shortcut, error: null });
        }
    });

    return (
        <Box flexDirection='column'>
            <Text bold>Glyph levels</Text>
            <Text dimColor>↑↓ select, ←→ step by 5, type a number to set it, Enter save, ESC cancel</Text>
            <Box marginTop={1}>
                <Text>{formatLevelSample(draft)}</Text>
            </Box>
            {input !== null && (
                <Box marginTop={1} flexDirection='column'>
                    <Box>
                        <Text>{`${getLevelBreakPointLabel(point)} (1-100): `}</Text>
                        <Text color='cyan'>{input.text}</Text>
                    </Box>
                    {input.error && <Text color='red'>{input.error}</Text>}
                </Box>
            )}
            <Box marginTop={1} flexDirection='column'>
                {LEVEL_BREAK_POINTS.map((breakPoint, index) => {
                    const isSelected = index === selectedIndex;
                    return (
                        <Box key={breakPoint} flexDirection='row' flexWrap='nowrap'>
                            <Box width={3}>
                                <Text color={isSelected ? 'green' : undefined}>{isSelected ? '▶ ' : '  '}</Text>
                            </Box>
                            <Box width={16}>
                                <Text color={isSelected ? 'green' : undefined}>{getLevelBreakPointLabel(breakPoint)}</Text>
                            </Box>
                            <Text>{`${points[breakPoint]}%`}</Text>
                        </Box>
                    );
                })}
            </Box>
        </Box>
    );
};

/** The glyph mode's editors: (g) the glyph per level, (l) the break points. Null for other actions. */
export function renderLevelGlyphEditor(props: WidgetEditorProps): React.ReactElement | null {
    if (props.action === SYMBOL_OVERRIDE_ACTION) {
        return renderSymbolSlotsEditor(props, getLevelGlyphSlots(props.widget));
    }
    if (props.action === EDIT_LEVELS_ACTION) {
        return <LevelBreakPointsEditor {...props} />;
    }
    return null;
}
