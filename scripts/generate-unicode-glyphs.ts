#!/usr/bin/env bun

// Regenerates src/widgets/shared/unicode-glyphs.ts, the glyph picker's full
// set of Unicode emoji and symbols, from Unicode's own data files:
//
//   curl -sLO https://unicode.org/Public/emoji/latest/emoji-test.txt
//   curl -sLO https://unicode.org/Public/UCD/latest/ucd/UnicodeData.txt
//   bun scripts/generate-unicode-glyphs.ts
//
// It reads both files from the current directory (the repo root); take them
// from the same Unicode release.
//
// Emoji: every fully-qualified emoji, except the skin tone variants (over
// 2,000 near-copies) and the skin tone and hair components on their own. An
// emoji that takes a skin tone also gets its light tone version, which the
// picker turns into whichever tone is chosen.
// Symbols: every named character in the symbol blocks below, plus a few
// common ones from elsewhere.

import {
    existsSync,
    readFileSync,
    writeFileSync
} from 'node:fs';

const OUTPUT = 'src/widgets/shared/unicode-glyphs.ts';
const EMOJI_SOURCE = 'emoji-test.txt';
const UCD_SOURCE = 'UnicodeData.txt';

// First and last codepoint of each block
const SYMBOL_BLOCKS: [number, number][] = [
    [0x2000, 0x206F], // General Punctuation
    [0x2100, 0x214F], // Letterlike Symbols
    [0x2190, 0x21FF], // Arrows
    [0x2200, 0x22FF], // Mathematical Operators
    [0x2300, 0x23FF], // Miscellaneous Technical
    [0x2500, 0x257F], // Box Drawing
    [0x2580, 0x259F], // Block Elements
    [0x25A0, 0x25FF], // Geometric Shapes
    [0x2600, 0x26FF], // Miscellaneous Symbols
    [0x2700, 0x27BF], // Dingbats
    [0x27F0, 0x27FF], // Supplemental Arrows-A
    [0x2800, 0x28FF], // Braille Patterns
    [0x2900, 0x297F], // Supplemental Arrows-B
    [0x2B00, 0x2BFF] // Miscellaneous Symbols and Arrows
];
// § « ± µ ¶ · » × ÷ Δ Σ Ω λ π
const EXTRA_SYMBOLS = new Set([0xA7, 0xAB, 0xB1, 0xB5, 0xB6, 0xB7, 0xBB, 0xD7, 0xF7, 0x394, 0x3A3, 0x3A9, 0x3BB, 0x3C0]);
// The skin tone modifiers, light to dark
const TONES = ['1F3FB', '1F3FC', '1F3FD', '1F3FE', '1F3FF'];
const LIGHT = '1F3FB';

for (const source of [EMOJI_SOURCE, UCD_SOURCE]) {
    if (!existsSync(source)) {
        console.error(`No ${source} here: download it into the repo root first (see the top of this script).`);
        process.exit(1);
    }
}

interface EmojiLine {
    codes: string[];
    name: string;
    group: string;
}

// "1F600 ; fully-qualified # 😀 E1.0 grinning face": after the "#", the emoji,
// the Emoji version it came in, then its name
function parseEmojiLine(line: string, group: string): EmojiLine | null {
    const semicolon = line.indexOf(';');
    const hash = line.indexOf('#', semicolon);
    if (line.startsWith('#') || semicolon === -1 || hash === -1 || line.slice(semicolon + 1, hash).trim() !== 'fully-qualified') {
        return null;
    }
    const words = line.slice(hash + 1).trim().split(' ');
    return { codes: line.slice(0, semicolon).trim().split(' '), name: words.slice(2).join(' '), group };
}

const emojiText = readFileSync(EMOJI_SOURCE, 'utf-8');
const version = /^# Version: (\S+)/m.exec(emojiText)?.[1] ?? 'unknown';
const emojiLines: EmojiLine[] = [];
let group = '';
for (const line of emojiText.split('\n')) {
    if (line.startsWith('# group: ')) {
        group = line.slice('# group: '.length).trim();
        continue;
    }
    const parsed = parseEmojiLine(line, group);
    if (parsed) {
        emojiLines.push(parsed);
    }
}

// An emoji's light tone version, kept when it has the light tone on every
// person and each other tone exists the same way. The emoji selector goes
// when a tone comes in (1F590 FE0F, 1F590 1F3FB), so emoji match without it.
const isTone = (code: string) => TONES.includes(code);
const withoutTone = (codes: string[]) => codes.filter(code => code !== 'FE0F' && !isTone(code)).join('-');
const fullyQualified = new Set(emojiLines.map(line => line.codes.join('-')));
const lightTones = new Map<string, string>();
for (const { codes } of emojiLines) {
    const light = codes.join('-');
    const tones = codes.filter(isTone);
    if (tones.length > 0 && tones.every(code => code === LIGHT) && TONES.every(tone => fullyQualified.has(light.replaceAll(LIGHT, tone)))) {
        lightTones.set(withoutTone(codes), light);
    }
}

// "1F44D/1F44D-1F3FB thumbs up": the light tone version after a "/"
const emoji = emojiLines
    .filter(line => line.group !== 'Component' && !line.codes.some(isTone))
    .map((line) => {
        const codes = [line.codes.join('-'), lightTones.get(withoutTone(line.codes))].filter(Boolean).join('/');
        return `${codes} ${line.name}`;
    });

// "2192;RIGHTWARDS ARROW;Sm;..." Spaces, controls, format and combining
// characters show nothing on their own, so they're left out.
const isSymbol = (code: number) => EXTRA_SYMBOLS.has(code) || SYMBOL_BLOCKS.some(([first, last]) => code >= first && code <= last);
const symbols: string[] = [];
for (const line of readFileSync(UCD_SOURCE, 'utf-8').split('\n')) {
    const [code = '', name = '', category = ''] = line.split(';');
    if (code && isSymbol(Number.parseInt(code, 16)) && !/^[ZCM]/.test(category) && !name.startsWith('<')) {
        symbols.push(`${code} ${name.toLowerCase()}`);
    }
}

// The data goes in single-quoted strings, so it can't hold ' or \ (Unicode's names don't)
const unsafe = [...emoji, ...symbols].find(entry => /['\\]/.test(entry));
if (unsafe) {
    console.error(`Can't write ${JSON.stringify(unsafe)} into a quoted string.`);
    process.exit(1);
}

writeFileSync(OUTPUT, `// Generated by scripts/generate-unicode-glyphs.ts from Unicode ${version}'s
// emoji-test.txt and UnicodeData.txt. Do not edit by hand; regenerate it instead.
//
// Entries are "code name;...": the hex codepoint (an emoji sequence's are
// joined with "-"), then the character's Unicode name. An emoji that takes a
// skin tone has its light tone version after the code: "1F44D/1F44D-1F3FB".
export const UNICODE_VERSION = '${version}';

export const EMOJI_GLYPHS = '${emoji.join(';')}';

export const SYMBOL_GLYPHS = '${symbols.join(';')}';
`);
console.log(`Wrote ${emoji.length} emoji (${lightTones.size} with skin tones) and ${symbols.length} symbols (Unicode ${version}) to ${OUTPUT}`);
