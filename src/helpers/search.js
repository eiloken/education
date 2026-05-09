// Utility: Levenshtein distance
function levenshtein(a, b) {
    const m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    const dp = Array.from({ length: m + 1 }, (_, i) => i);
    for (let j = 1; j <= n; j++) {
        let prev = dp[0];
        dp[0] = j;
        for (let i = 1; i <= m; i++) {
        const cur = dp[i];
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i] = Math.min(
            dp[i] + 1,
            dp[i - 1] + 1,
            prev + cost
        );
        prev = cur;
        }
    }
    return dp[m];
}

// Normalize fuzzy distance to score between 0 and 1
function fuzzyScore(input, candidate) {
    if (!input) return 0;
    const dist = levenshtein(input.toLowerCase(), candidate.toLowerCase());
    const maxLen = Math.max(input.length, candidate.length);
    return 1 - dist / maxLen;
}

// Main suggestion function
function getSuggestions(input, items, { limit = 10, minScore = 0.2 } = {}) {
    if (!input) return [];
    const q = input.trim().toLowerCase();
    const results = [];

    for (const item of items) {
        const text = String(item).toLowerCase();
        let score = 0;

        // Exact prefix match gets big boost
        if (text.startsWith(q)) {
        score = 1.0;
        } else if (text.includes(q)) {
        // Substring match
        score = 0.75;
        // Slightly prefer earlier positions
        const pos = text.indexOf(q);
        score -= pos * 0.01;
        } else {
        // Fuzzy fallback
        score = fuzzyScore(q, text) * 0.9;
        }

        if (score >= minScore) {
        results.push({ item, score });
        }
    }

    // Sort by score desc, then by item for stable order
    results.sort((a, b) => b.score - a.score || String(a.item).localeCompare(String(b.item)));

    return results.slice(0, limit).map(r => ({ value: r.item, score: r.score }));
}

export default getSuggestions;