import type { RenderContext } from '../types/RenderContext';
import { getWeeklyLimitInMs } from '../utils/weekly-limit';

import { LimitTimerWidget } from './shared/limit-timer-widget';

export class WeeklyLimitTimerWidget extends LimitTimerWidget {
    protected readonly label = 'Weekly Limit: ';
    protected readonly previewLimitInMs = 37 * 60 * 60 * 1000;

    getDescription(): string { return 'Time until the 7-day limit at this week\'s average pace; shown only when that comes before the reset'; }
    getDisplayName(): string { return 'Weekly Limit Timer'; }

    protected getLimitInMs(context: RenderContext): number | null {
        const percent = context.usageData?.weeklyUsage;
        const resetAt = context.usageData?.weeklyResetAt;
        if (percent === undefined || resetAt === undefined) {
            return null;
        }

        return getWeeklyLimitInMs({ percent, nowMs: Date.now(), resetAtMs: Date.parse(resetAt) });
    }
}
