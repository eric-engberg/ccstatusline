import type {
    BlockMetrics,
    SkillsMetrics
} from '../types';

import type { AccountEmailResult } from './AccountEmail';
import type { SessionForecast } from './SessionForecast';
import type { SpeedMetrics } from './SpeedMetrics';
import type { StatusJSON } from './StatusJSON';
import type { TokenMetrics } from './TokenMetrics';

export interface RenderUsageData {
    sessionUsage?: number;
    sessionResetAt?: string;
    weeklyUsage?: number;
    weeklyResetAt?: string;
    weeklySonnetUsage?: number;
    weeklySonnetResetAt?: string;
    weeklyOpusUsage?: number;
    weeklyOpusResetAt?: string;
    fableUsage?: number;
    fableResetAt?: string;
    spendLimitUsage?: number;
    spendLimitUsedUsd?: number;
    spendLimitLimitUsd?: number;
    extraUsageEnabled?: boolean;
    extraUsageLimit?: number;
    extraUsageUsed?: number;
    extraUsageUtilization?: number;
    extraUsageCurrency?: string;
    extraUsageUsedToday?: number;
    apiSessionUsage?: number;
    error?: 'no-credentials' | 'timeout' | 'rate-limited' | 'api-error' | 'parse-error';
}

export interface ClaudeStatusRenderData {
    indicator?: string;
    incidents?: {
        impact: 'minor' | 'major' | 'critical';
        startMs: number;
        endMs: number | null;
    }[];
    error?: boolean;
}

export interface CompactionData {
    count: number;
    byTrigger: { auto: number; manual: number; unknown: number };
    tokensReclaimed: number;
}

export interface RenderContext {
    data?: StatusJSON;
    // Claude Code's JSON as it arrived, for Custom Command's stdin. The
    // validated `data` drops nested fields the schema doesn't list and turns
    // number strings into numbers.
    rawData?: Record<string, unknown>;
    tokenMetrics?: TokenMetrics | null;
    speedMetrics?: SpeedMetrics | null;
    windowedSpeedMetrics?: Record<string, SpeedMetrics> | null;
    usageData?: RenderUsageData | null;
    sessionForecast?: SessionForecast | null;
    claudeStatusData?: ClaudeStatusRenderData | null;
    accountEmail?: AccountEmailResult;  // Email of the account the live OAuth credentials belong to
    sessionDuration?: string | null;
    transcriptSessionName?: string | null;
    transcriptThinkingEffort?: { value: string; known: boolean } | null;
    blockMetrics?: BlockMetrics | null;
    skillsMetrics?: SkillsMetrics | null;
    compactionData?: CompactionData | null;
    terminalWidth?: number | null;
    // Cells for this widget's bar, set by the renderer when the bar has a width
    // setting (see widgets/shared/bar-width.ts); otherwise its mode's own size
    barCells?: number;
    // Set while sizeBarsToLines renders a line only to measure it: plain mode
    // gives flex separators no columns, as they can on a full line. Powerline
    // keeps its one-column break there, so a bar leaves room for it
    measuringLine?: boolean;
    isPreview?: boolean;
    minimalist?: boolean;
    gitCacheTtlSeconds?: number;
    customCommandCacheTtlSeconds?: number;
    gitReviewNeedsChecks?: boolean;
    lineIndex?: number;  // Index of the current line being rendered (for theme cycling)
    globalSeparatorIndex?: number;  // Global separator index that continues across lines

    // For git widget thresholds
    gitData?: {
        changedFiles?: number;
        insertions?: number;
        deletions?: number;
    };
    globalPowerlineThemeIndex?: number;  // Global powerline theme index that continues across lines
    globalPowerlineStartCapIndex?: number;  // Global start cap index across powerline flex segments and lines
}
