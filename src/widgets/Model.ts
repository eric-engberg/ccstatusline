import React from 'react';

import { getColorLevelString } from '../types/ColorLevel';
import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetEditorProps,
    WidgetItem
} from '../types/Widget';

import { makeModifierText } from './shared/editor-display';
import {
    EDIT_FAMILY_COLORS_ACTION,
    MODEL_DEFAULT_COLOR,
    ModelFamilyColorsEditor
} from './shared/model-family-colors-editor';
import {
    formatModelName,
    getModelFamily,
    isFamilyColorsEnabled
} from './shared/model-family-style';

export class ModelWidget implements Widget {
    getDefaultColor(): string { return MODEL_DEFAULT_COLOR; }
    getDescription(): string { return 'Displays the Claude model name (e.g., Claude 3.5 Sonnet).\nOptionally colors it by model family (Opus, Sonnet, Haiku, Fable).'; }
    getDisplayName(): string { return 'Model'; }
    getCategory(): string { return 'Core'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return {
            displayText: this.getDisplayName(),
            modifierText: makeModifierText(isFamilyColorsEnabled(item) ? ['family colors'] : [])
        };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        let name: string;
        let id: string | undefined;
        if (context.isPreview) {
            // With family colors on, the preview shows a model that has one
            name = isFamilyColorsEnabled(item) ? 'Opus' : 'Claude';
        } else {
            const model = context.data?.model;
            const modelDisplayName = typeof model === 'string'
                ? model
                : (model?.display_name ?? model?.id);
            if (!modelDisplayName) {
                return null;
            }
            name = modelDisplayName.replace(/\s*\(.*\)$/, '');
            id = typeof model === 'string' ? undefined : model?.id;
        }

        return formatModelName(item, name, getModelFamily(name, id), {
            colorLevel: getColorLevelString(settings.colorLevel),
            colorsDisabled: settings.colorLevel === 0,
            // Same resolution as the renderer: '' is the color menu's "Default"
            // (no color), only an unset color falls back to the widget default
            baseColor: item.color ?? this.getDefaultColor()
        });
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [{ key: 'f', label: '(f)amily colors', action: EDIT_FAMILY_COLORS_ACTION }];
    }

    renderEditor(props: WidgetEditorProps): React.ReactElement {
        return React.createElement(ModelFamilyColorsEditor, props);
    }

    // Family colors embed their own foreground codes, so the renderer must
    // leave this widget's foreground alone, as it does for Thinking Effort
    preservesRenderedColors(item: WidgetItem): boolean {
        return isFamilyColorsEnabled(item);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
