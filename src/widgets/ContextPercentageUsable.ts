import type { RenderContext } from '../types/RenderContext';
import { getContextWindowMetrics } from '../utils/context-window';
import {
    getContextConfig,
    getModelContextIdentifier
} from '../utils/model-context';

import { ContextPercentageWidgetBase } from './shared/context-percentage-widget-base';

export class ContextPercentageUsableWidget extends ContextPercentageWidgetBase {
    protected readonly labelPrefix = 'Ctx(u)';
    protected readonly previewUsedPercent = 11.6;

    getDefaultColor(): string { return 'green'; }
    getDescription(): string { return 'Shows percentage of usable context window used or remaining (80% of max before auto-compact)'; }
    getDisplayName(): string { return 'Context % (usable)'; }

    protected getUsedPercentage(context: RenderContext): number | null {
        const modelIdentifier = getModelContextIdentifier(context.data?.model);
        const contextWindowMetrics = getContextWindowMetrics(context.data);
        const contextConfig = getContextConfig(modelIdentifier, contextWindowMetrics.windowSize);
        const contextLength = contextWindowMetrics.contextLengthTokens ?? context.tokenMetrics?.contextLength ?? null;
        return contextLength === null ? null : Math.min(100, (contextLength / contextConfig.usableTokens) * 100);
    }
}
