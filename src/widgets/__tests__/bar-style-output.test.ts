import {
    describe,
    expect,
    it
} from 'vitest';

import {
    DEFAULT_SETTINGS,
    type Settings
} from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import {
    calculateMaxWidthsFromPreRendered,
    preRenderAllWidgets,
    renderStatusLine
} from '../../utils/renderer';
import { getWidget } from '../../utils/widgets';

// Block and slider bars exactly as they render, colors included: a gradient
// preset (with a time cursor, and filling with what's left), value colors at
// 256 colors and in true RGB, plain bars, and a global foreground override
const BANDS = {
    'valueColors': 'true',
    'valueColor.low': 'hex:00ff00',
    'valueColor.mid': 'hex:ffff00',
    'valueColor.high': 'hex:ff0000'
};

interface BarOutputCase {
    type: string;
    metadata: Record<string, string>;
    colorLevel: 2 | 3;
    override?: string;
    expected: string;
}

const cases: BarOutputCase[] = [
    { type: 'session-usage', metadata: { display: 'progress', gradient: 'traffic', cursor: 'true', invert: 'true' }, colorLevel: 3, expected: '5h: [\x1b[38;2;220;40;20m█\x1b[38;2;221;57;20m█\x1b[38;2;223;71;20m█\x1b[38;2;60;60;60m░░░░░░░░░░░░░\x1b[39m│\x1b[38;2;60;60;60m░░░░░░░░░░░░░░░\x1b[39m] 10.0%' },
    { type: 'weekly-usage', metadata: { display: 'slider', barWidth: 'medium', ...BANDS }, colorLevel: 3, expected: 'Weekly: \x1b[38;2;255;255;0m▓▓▓▓▓▓▓▓▓▓▓▓▓░░░ 80.0%\x1b[39m' },
    { type: 'context-bar', metadata: { gradient: 'thermal' }, colorLevel: 3, expected: 'Context: [\x1b[38;2;58;111;216m█\x1b[38;2;79;108;215m█\x1b[38;2;96;104;214m█\x1b[38;2;111;100;213m█\x1b[38;2;123;96;212m█\x1b[38;2;135;91;211m█\x1b[38;2;146;85;210m█\x1b[38;2;157;79;209m█\x1b[38;2;166;76;200m█\x1b[38;2;175;78;184m█\x1b[38;2;185;78;168m█\x1b[38;2;194;76;151m█\x1b[38;2;203;74;134m█\x1b[38;2;213;69;116m█\x1b[38;2;60;60;60m░░\x1b[39m] 180k/200k (90%)' },
    { type: 'context-percentage', metadata: { display: 'slider', gradient: 'viridis', inverse: 'true' }, colorLevel: 3, expected: 'Ctx Left: \x1b[38;2;253;231;37m▓\x1b[38;2;60;60;60m░░░░░░░░░\x1b[39m 10.0%' },
    { type: 'block-timer', metadata: { display: 'slider', barWidth: 'long' }, colorLevel: 2, expected: 'Block ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░ 73.9%' },
    { type: 'extra-usage-utilization', metadata: { display: 'progress-short', barWidth: 'short', valueColorMode: 'gradient', valueColors: 'true' }, colorLevel: 2, expected: 'Overage: \x1b[38;5;172m[█████████░] 85.0%\x1b[39m' },
    { type: 'reset-timer', metadata: { display: 'slider-only', gradient: 'blue-orange' }, colorLevel: 3, expected: 'Reset \x1b[38;2;0;114;178m▓\x1b[38;2;76;142;168m▓\x1b[38;2;125;168;153m▓\x1b[38;2;171;193;131m▓\x1b[38;2;217;216;96m▓\x1b[38;2;239;213;60m▓\x1b[38;2;235;184;47m▓\x1b[38;2;229;155;34m▓\x1b[38;2;222;125;19m▓\x1b[38;2;60;60;60m░\x1b[39m' },
    { type: 'context-bar', metadata: { display: 'slider', gradient: 'traffic' }, colorLevel: 3, override: 'red', expected: 'Context: ▓▓▓▓▓▓▓▓▓░ 180k/200k (90%)' }
];

describe('block and slider bar output', () => {
    it.each(cases)('$type with $metadata at color level $colorLevel', ({ type, metadata, colorLevel, override, expected }) => {
        const settings: Settings = { ...DEFAULT_SETTINGS, colorLevel, ...(override ? { overrideForegroundColor: override } : {}) };
        const item: WidgetItem = { id: 'w', type, metadata };
        expect(getWidget(type)?.render(item, { isPreview: true }, settings)).toBe(expected);
    });

    const line: WidgetItem[] = [
        { id: '1', type: 'session-usage', color: 'hex:81A1C1', metadata: { display: 'progress-short', gradient: 'traffic' } },
        { id: '2', type: 'context-percentage', color: 'hex:D8DEE9', metadata: { display: 'slider', ...BANDS } }
    ];
    const renderLine = (powerline: boolean): string => {
        const settings: Settings = { ...DEFAULT_SETTINGS, colorLevel: 3, powerline: { ...DEFAULT_SETTINGS.powerline, enabled: powerline } };
        const preRendered = preRenderAllWidgets([line], settings, { isPreview: true });
        return renderStatusLine(line, settings, { isPreview: true }, preRendered[0] ?? [], calculateMaxWidthsFromPreRendered(preRendered, settings));
    };

    it('renders a line of them in plain mode', () => {
        expect(renderLine(false)).toBe('\x1b[38;2;129;161;193m5h: [\x1b[38;2;0;200;80m█\x1b[38;2;76;201;75m█\x1b[38;2;108;201;70m█\x1b[38;2;133;202;64m█\x1b[38;2;155;202;56m█\x1b[38;2;175;201;47m█\x1b[38;2;194;201;36m█\x1b[38;2;211;200;18m█\x1b[38;2;222;191;3m█\x1b[38;2;224;173;9m█\x1b[38;2;226;155;13m█\x1b[38;2;227;137;16m█\x1b[38;2;226;117;18m█\x1b[38;2;225;96;19m█\x1b[38;2;60;60;60m░░\x1b[38;2;129;161;193m] 90.0%\x1b[39m\x1b[38;2;216;222;233mCtx Used: \x1b[38;2;255;0;0m▓▓▓▓▓▓▓▓▓░ 90.0%\x1b[38;2;216;222;233m\x1b[39m');
    });

    it('renders a line of them in Powerline mode', () => {
        expect(renderLine(true)).toBe('\x1b[38;2;129;161;193m5h: [\x1b[38;2;0;200;80m█\x1b[38;2;76;201;75m█\x1b[38;2;108;201;70m█\x1b[38;2;133;202;64m█\x1b[38;2;155;202;56m█\x1b[38;2;175;201;47m█\x1b[38;2;194;201;36m█\x1b[38;2;211;200;18m█\x1b[38;2;222;191;3m█\x1b[38;2;224;173;9m█\x1b[38;2;226;155;13m█\x1b[38;2;227;137;16m█\x1b[38;2;226;117;18m█\x1b[38;2;225;96;19m█\x1b[38;2;60;60;60m░░\x1b[38;2;129;161;193m] 90.0%\x1b[49m\x1b[39m\x1b[38;2;216;222;233mCtx Used: \x1b[38;2;255;0;0m▓▓▓▓▓▓▓▓▓░ 90.0%\x1b[38;2;216;222;233m\x1b[49m\x1b[39m');
    });
});
