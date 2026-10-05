import React from 'react';

import type { WidgetEditorProps } from '../../types/Widget';
import {
    KNOWN_THINKING_EFFORTS,
    type TranscriptThinkingEffort
} from '../../utils/jsonl-metadata';

import {
    ColorListEditor,
    EDITOR_COLOR_LEVEL,
    type ColorListEditorConfig
} from './color-list-editor';
import {
    THINKING_EFFORT_DEFAULT_COLOR,
    formatThinkingEffort,
    getBracketColorMode,
    getLevelColor,
    isLevelColorsEnabled,
    resetLevelColors,
    setBracketColorMode,
    setLevelColor,
    setLevelColorsEnabled
} from './effort-style';

export const EDIT_LEVEL_COLORS_ACTION = 'edit-level-colors';

const LEVEL_COLORS_CONFIG: ColorListEditorConfig<TranscriptThinkingEffort, 'brackets'> = {
    title: 'Thinking Effort: level colors',
    toggleLabel: 'Level colors',
    rows: [
        ...KNOWN_THINKING_EFFORTS.map(level => ({ kind: 'color' as const, key: level, label: level })),
        { kind: 'choice', key: 'brackets', label: 'brackets' }
    ],
    isEnabled: isLevelColorsEnabled,
    setEnabled: setLevelColorsEnabled,
    getColor: (item, level) => getLevelColor(item, level, EDITOR_COLOR_LEVEL),
    setColor: setLevelColor,
    getChoiceLabel: item => (getBracketColorMode(item) === 'effort' ? 'Match effort' : 'Widget color'),
    cycleChoice: item => setBracketColorMode(item, getBracketColorMode(item) === 'effort' ? 'widget' : 'effort'),
    resetColors: resetLevelColors,
    renderSample: (item, level) => formatThinkingEffort(item, { text: level, level }, {
        colorLevel: EDITOR_COLOR_LEVEL,
        colorsDisabled: false,
        baseColor: item.color ?? THINKING_EFFORT_DEFAULT_COLOR
    })
};

export const EffortColorsEditor: React.FC<WidgetEditorProps> = props => (
    <ColorListEditor {...props} config={LEVEL_COLORS_CONFIG} />
);
