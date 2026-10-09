import type { RenderContext } from '../types/RenderContext';

import { LimitTimerWidget } from './shared/limit-timer-widget';

export class SessionLimitTimerWidget extends LimitTimerWidget {
    protected readonly label = 'Limit: ';
    protected readonly previewLimitInMs = 73 * 60 * 1000;

    getDescription(): string { return 'Time until the 5-hour limit at the current pace; shown only when that comes before the reset'; }
    getDisplayName(): string { return 'Session Limit Timer'; }

    protected getLimitInMs(context: RenderContext): number | null {
        return context.sessionForecast?.limitInMs ?? null;
    }
}
