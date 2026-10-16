// What a value colors scale counts in: a percent of something, or an amount
// such as dollars or tokens. Break points and the gradient's end are stored in
// the unit itself, e.g. "2.5" for $2.50 or "1500000" for 1.5M tokens.
export interface ValueUnit {
    // A break point or the gradient's end as the editor shows it: "70%", "$5", "100k"
    format: (value: number) => string;
    // A typed value, or null when it isn't one; parseUnitValue checks the range
    parse: (text: string) => number | null;
    // What ←→ step by; a value off the step steps back onto it
    step: number;
    // The decimal places a value can have; break points stay one such place apart
    decimals: number;
    min: number;
    max: number;
    // The typed rows' prompt, the error for a value that isn't one, and the help line
    hint: string;
    error: string;
    typeHelp: string;
}

function parseWholeNumber(text: string): number | null {
    return /^\d+$/.test(text) ? Number.parseInt(text, 10) : null;
}

function parseDollars(text: string): number | null {
    const match = /^\$?(\d+(?:\.\d{1,2})?)$/.exec(text);
    return match?.[1] ? Number.parseFloat(match[1]) : null;
}

const TOKEN_MULTIPLIERS: Record<string, number> = { '': 1, 'k': 1000, 'm': 1000000 };

// "250000", "250k" or "1.5M"; a value that comes to less than a whole token isn't one
function parseTokens(text: string): number | null {
    const match = /^(\d+(?:\.\d+)?)([km]?)$/i.exec(text);
    const multiplier = TOKEN_MULTIPLIERS[match?.[2]?.toLowerCase() ?? ''];
    if (!match?.[1] || multiplier === undefined) {
        return null;
    }
    // Rounded past float noise, so 1.005k is 1005 rather than 1004.9999999999999
    const tokens = Number((Number.parseFloat(match[1]) * multiplier).toFixed(6));
    return Number.isInteger(tokens) ? tokens : null;
}

// Up to two decimals, without trailing zeros: 1.5, 12.25, 100
function formatShort(value: number): string {
    return String(Number(value.toFixed(2)));
}

function formatDollars(value: number): string {
    return `$${Number.isInteger(value) ? value : value.toFixed(2)}`;
}

// As the token widgets show them: M from a million (2000M rather than 2B), k from a thousand
function formatTokenCount(value: number): string {
    if (value >= 1000000) {
        return `${formatShort(value / 1000000)}M`;
    }
    return value >= 1000 ? `${formatShort(value / 1000)}k` : String(value);
}

/** A typed value in the unit's range, or null. */
export function parseUnitValue(unit: ValueUnit, text: string): number | null {
    const value = unit.parse(text.trim());
    return value === null || value < unit.min || value > unit.max ? null : value;
}

/** A value rounded to the unit's decimal places, e.g. a share of the gradient's end. */
export function roundToUnit(unit: ValueUnit, value: number): number {
    return Number(value.toFixed(unit.decimals));
}

/** A value rounded down to the unit's decimal places, so half of 1 is 0 rather than 1. */
export function floorToUnit(unit: ValueUnit, value: number): number {
    const scale = 10 ** unit.decimals;
    return Math.floor(value * scale) / scale;
}

/** The default: a percent of a limit, a budget or the context window. */
export const PERCENT_UNIT: ValueUnit = {
    format: value => `${value}%`,
    parse: parseWholeNumber,
    step: 5,
    decimals: 0,
    min: 1,
    max: 999,
    hint: 'percent, 1-999',
    error: 'Use a whole number from 1 to 999.',
    typeHelp: 'Type a number on a percent row to set it exactly'
};

export const DOLLAR_UNIT: ValueUnit = {
    format: formatDollars,
    parse: parseDollars,
    step: 1,
    decimals: 2,
    min: 0.01,
    max: 9999,
    hint: 'dollars, e.g. 2.50',
    error: 'Use a dollar amount from 0.01 to 9999, with up to 2 decimals.',
    typeHelp: 'Type an amount on a dollar row to set it exactly'
};

export const DOLLARS_PER_HOUR_UNIT: ValueUnit = {
    ...DOLLAR_UNIT,
    format: value => `${formatDollars(value)}/hr`,
    hint: 'dollars per hour, e.g. 2.50'
};

/** Token counts run from a few hundred to billions, so each widget picks its own step. */
export function makeTokenUnit(step: number): ValueUnit {
    return {
        format: formatTokenCount,
        parse: parseTokens,
        step,
        decimals: 0,
        min: 1,
        max: 99999000000,
        hint: 'tokens, e.g. 250k or 1.5M',
        error: 'Use a token count from 1 to 99999M, e.g. 5000, 250k or 1.5M.',
        typeHelp: 'Type a count like 250k or 1.5M on a token row to set it exactly'
    };
}

export const COUNT_UNIT: ValueUnit = {
    format: String,
    parse: parseWholeNumber,
    step: 1,
    decimals: 0,
    min: 1,
    max: 999,
    hint: 'count, 1-999',
    error: 'Use a whole number from 1 to 999.',
    typeHelp: 'Type a number on a count row to set it exactly'
};
