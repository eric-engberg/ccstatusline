import type { RenderContext } from '../types/RenderContext';

import {
    TokenCountWidget,
    makeTokenScale
} from './shared/token-count-widget';

export class TokensTotalWidget extends TokenCountWidget {
    protected readonly label = 'Total: ';
    protected readonly previewTokens = 30600;
    protected readonly valueColorScale = makeTokenScale(10_000_000, 100_000_000, 5_000_000);

    getDefaultColor(): string { return 'cyan'; }
    getDescription(): string { return 'Shows total token count (input + output + cache) for the current session'; }
    getDisplayName(): string { return 'Tokens Total'; }

    protected getTokenCount(context: RenderContext): number | null {
        return context.tokenMetrics?.totalTokens ?? null;
    }
}
