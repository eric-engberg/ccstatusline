import {
    Box,
    Text,
    useInput
} from 'ink';
import pluralize from 'pluralize';
import React, {
    useEffect,
    useMemo,
    useState
} from 'react';

import type { Settings } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import { getPlainInput } from '../../utils/input-guards';
import {
    isPowerlineLine,
    removeLinePowerline,
    swapLinePowerline,
    toggleLinePowerline
} from '../../utils/powerline-lines';

import { ConfirmDialog } from './ConfirmDialog';
import { List } from './List';

interface LineSelectorProps {
    lines: WidgetItem[][];
    onSelect: (line: number) => void;
    onBack: () => void;
    // With settings, also the per-line Powerline modes (powerline.lineEnabled),
    // which move and are deleted with their lines
    onLinesUpdate: (lines: WidgetItem[][], lineEnabled?: (boolean | null)[]) => void;
    initialSelection?: number;
    title?: string;
    settings?: Settings;
}

// The lines with lines `a` and `b` swapped
function swapLines(lines: WidgetItem[][], a: number, b: number): WidgetItem[][] {
    const swapped = [...lines];
    const first = swapped[a];
    const second = swapped[b];
    if (first && second) {
        [swapped[a], swapped[b]] = [second, first];
    }
    return swapped;
}

// "(2 widgets)", or "(2 widgets, plain)" with the line's mode
function getLineSublabel(line: WidgetItem[], mode: string | null): string {
    const count = line.length > 0 ? pluralize('widget', line.length, true) : 'empty';
    return mode ? `(${count}, ${mode})` : `(${count})`;
}

function getHelpText(lineCount: number, canSwitchModes: boolean): string {
    const keys = lineCount > 1
        ? '(a) to append new line, (d) to delete line, (m) to move line, ESC to go back'
        : '(a) to append new line, ESC to go back';
    return canSwitchModes ? `${keys}, (p) Powerline/plain` : keys;
}

const LineSelector: React.FC<LineSelectorProps> = ({
    lines,
    onSelect,
    onBack,
    onLinesUpdate,
    initialSelection = 0,
    title,
    settings
}) => {
    const [selectedIndex, setSelectedIndex] = useState(initialSelection);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [moveMode, setMoveMode] = useState(false);
    const [localLines, setLocalLines] = useState(lines);
    const [localLineEnabled, setLocalLineEnabled] = useState(settings?.powerline.lineEnabled);

    useEffect(() => {
        setLocalLines(lines);
    }, [lines]);

    useEffect(() => {
        setLocalLineEnabled(settings?.powerline.lineEnabled);
    }, [settings?.powerline.lineEnabled]);

    // The settings as edited here, for each line's Powerline mode
    const localSettings = useMemo(
        () => (settings ? { ...settings, lines: localLines, powerline: { ...settings.powerline, lineEnabled: localLineEnabled } } : undefined),
        [settings, localLines, localLineEnabled]
    );
    const isLinePowerline = (index: number) => (localSettings ? isPowerlineLine(localSettings, index) : false);

    const commitLines = (newLines: WidgetItem[][], newLineEnabled: (boolean | null)[] | undefined) => {
        setLocalLines(newLines);
        if (settings) {
            setLocalLineEnabled(newLineEnabled);
            onLinesUpdate(newLines, newLineEnabled);
        } else {
            onLinesUpdate(newLines);
        }
    };

    useEffect(() => {
        setSelectedIndex(initialSelection);
    }, [initialSelection]);

    const selectedLine = useMemo(
        () => localLines[selectedIndex],
        [localLines, selectedIndex]
    );

    const appendLine = () => {
        const newLines = [...localLines, []];
        commitLines(newLines, localLineEnabled);
        setSelectedIndex(newLines.length - 1);
    };

    const deleteLine = (lineIndex: number) => {
    // Don't allow deleting the last remaining line
        if (localLines.length <= 1) {
            return;
        }
        const newLines = [...localLines];
        newLines.splice(lineIndex, 1);
        commitLines(newLines, removeLinePowerline(localLineEnabled, lineIndex));
    };

    // Swaps the highlighted line with the one above (-1) or below (1), wrapping
    // past either end; its Powerline mode moves with it
    const moveSelectedLine = (direction: 1 | -1) => {
        const targetIndex = (selectedIndex + direction + localLines.length) % localLines.length;
        commitLines(swapLines(localLines, selectedIndex, targetIndex), swapLinePowerline(localLineEnabled, selectedIndex, targetIndex));
        setSelectedIndex(targetIndex);
    };

    const showsLineModes = Boolean(localSettings) && localLines.some((_, index) => isLinePowerline(index));

    // Handle keyboard input
    useInput((input, key) => {
        const shortcut = getPlainInput(input, key);
        if (showDeleteDialog) {
            return;
        }

        if (moveMode) {
            if (key.upArrow && localLines.length > 1) {
                moveSelectedLine(-1);
            } else if (key.downArrow && localLines.length > 1) {
                moveSelectedLine(1);
            } else if (key.escape || key.return) {
                setMoveMode(false);
            }
            return;
        }

        switch (shortcut) {
            case 'a':
                appendLine();
                return;
            case 'd':
                if (localLines.length > 1 && selectedIndex < localLines.length) {
                    setShowDeleteDialog(true);
                }
                return;
            case 'm':
                if (localLines.length > 1 && selectedIndex < localLines.length) {
                    setMoveMode(true);
                }
                return;
            case 'p':
                if (localSettings && selectedIndex < localLines.length) {
                    commitLines(localLines, toggleLinePowerline(localSettings, selectedIndex).powerline.lineEnabled);
                }
                return;
        }

        if (key.escape) {
            onBack();
        }
    });

    if (showDeleteDialog && selectedLine) {
        const suffix
            = selectedLine.length > 0
                ? pluralize('widget', selectedLine.length, true)
                : 'empty';

        return (
            <Box flexDirection='column'>
                <Box flexDirection='column' gap={1}>
                    <Text bold>
                        <Text>
                            <Text>
                                ☰ Line
                                {selectedIndex + 1}
                            </Text>
                            {' '}
                            <Text dimColor>
                                (
                                {suffix}
                                )
                            </Text>
                        </Text>
                    </Text>
                    <Text bold>Are you sure you want to delete line?</Text>
                </Box>

                <Box marginTop={1}>
                    <ConfirmDialog
                        inline={true}
                        onConfirm={() => {
                            deleteLine(selectedIndex);
                            setSelectedIndex(Math.max(0, selectedIndex - 1));
                            setShowDeleteDialog(false);
                        }}
                        onCancel={() => {
                            setShowDeleteDialog(false);
                        }}
                    />
                </Box>
            </Box>
        );
    }

    const getLineMode = (index: number) => (isLinePowerline(index) ? 'Powerline' : 'plain');
    const lineItems = localLines.map((line, index) => ({
        label: `☰ Line ${index + 1}`,
        sublabel: getLineSublabel(line, showsLineModes ? getLineMode(index) : null),
        value: index
    }));

    return (
        <>
            <Box flexDirection='column'>
                <Box>
                    <Text bold>
                        {title ?? 'Select Line to Edit'}
                        {' '}
                    </Text>
                    {moveMode && <Text color='blue'>[MOVE MODE]</Text>}
                </Box>
                <Text dimColor>
                    Choose which status line to configure
                </Text>
                {moveMode ? (
                    <Text dimColor>↑↓ to move line, ESC or Enter to exit move mode</Text>
                ) : (
                    <Text dimColor>
                        {getHelpText(localLines.length, Boolean(localSettings))}
                    </Text>
                )}

                {moveMode ? (
                    <Box marginTop={1} flexDirection='column'>
                        {localLines.map((line, index) => {
                            const isSelected = selectedIndex === index;
                            const suffix = line.length
                                ? pluralize('widget', line.length, true)
                                : 'empty';

                            return (
                                <Box key={index}>
                                    <Text color={isSelected ? 'blue' : undefined}>
                                        <Text>{isSelected ? '◆  ' : '   '}</Text>
                                        <Text>
                                            <Text>
                                                ☰ Line
                                                {' '}
                                                {index + 1}
                                            </Text>
                                            {' '}
                                            <Text dimColor={!isSelected}>
                                                (
                                                {suffix}
                                                )
                                            </Text>
                                        </Text>
                                    </Text>
                                </Box>
                            );
                        })}
                    </Box>
                ) : (
                    <List
                        marginTop={1}
                        items={lineItems}
                        onSelect={(line) => {
                            if (line === 'back') {
                                onBack();
                                return;
                            }

                            onSelect(line);
                        }}
                        onSelectionChange={(_, index) => {
                            setSelectedIndex(index);
                        }}
                        initialSelection={selectedIndex}
                        showBackButton={true}
                    />
                )}
            </Box>
        </>
    );
};

export { LineSelector, type LineSelectorProps };
