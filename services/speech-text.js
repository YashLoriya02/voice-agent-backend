// Display and synthesis use the same plain response. Device tool arguments
// (including the user's exact outgoing message) never pass through this helper.
export function cleanSpeechText(input) {
    return String(input ?? '')
        .replace(/```[^\n]*\n/g, '').replace(/```/g, '')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/<\/?[A-Za-z][A-Za-z0-9]*(?:\s[^>]*)?\/?>/g, '')
        .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        .replace(/^\s*(?:#{1,6}\s+|>\s*|[-*+]\s+)/gm, '')
        .replace(/^\s*(?:[-_*]\s*){3,}\s*$/gm, '')
        .replace(/^\s*\|?[ :|-]+\|[ :|-]*$/gm, '')
        .replace(/(\d)\s*\*\s*(?=\d)/g, '$1 times ')
        .replace(/\*\*(.+?)\*\*|__(.+?)__|~~(.+?)~~/g, (_, a, b, c) => a ?? b ?? c)
        .replace(/(?<!\w)[*_]([^*_\n]+)[*_](?!\w)/g, '$1')
        .replace(/`/g, '').replace(/(\d)\s*\*\s*(?=\d)/g, '$1 times ')
        .replace(/\*+/g, '').replace(/\|/g, ', ')
        .replace(/[\u{1F000}-\u{1FAFF}\u2600-\u27BF\u23E9-\u23F3\u231A\u231B\u2B50\u2B55\u200D\uFE0E\uFE0F\u20E3\u{E0020}-\u{E007F}]/gu, '')
        .replace(/\s+/g, ' ').trim();
}

export function voiceReply(input, maximum = 90) {
    const clean = cleanSpeechText(input);
    const words = clean.split(/\s+/);
    if (words.length <= maximum) return clean;
    const prefix = words.slice(0, maximum).join(' ');
    const sentences = [...prefix.matchAll(/[.!?।](?:\s|$)/g)];
    const last = sentences.at(-1);
    return last && last.index > prefix.length / 2
        ? prefix.slice(0, last.index + 1)
        : `${prefix}…`;
}
