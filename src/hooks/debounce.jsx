import React, { useEffect, useState } from "react";

/* ─── debounce hook ─────────────────────────────────────────────────── */
export function useDebounce(value, delay = 380) {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const id = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(id);
    }, [value, delay]);
    return debounced;
}
