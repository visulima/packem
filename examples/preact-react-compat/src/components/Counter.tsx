// Using React-style imports - automatically resolved to preact/compat
import { useState, useMemo } from "react";

/**
 * Counter component - Demonstrates React hooks with Preact
 * All React imports work seamlessly via the preset's aliases
 */
export function Counter() {
    // Using React useState - works via preact/compat alias
    const [count, setCount] = useState(0);
    const [multiplier, setMultiplier] = useState(1);

    // Using React useMemo - works via preact/compat alias
    const doubled = useMemo(() => count * 2, [count]);
    const multiplied = useMemo(() => count * multiplier, [count, multiplier]);

    const handleIncrement = () => {
        setCount((prev) => prev + 1);
    };

    const handleDecrement = () => {
        setCount((prev) => prev - 1);
    };

    return (
        <div style={{ border: "1px solid #ccc", padding: "16px", marginBottom: "16px", borderRadius: "8px" }}>
            <h2>Counter Component (React-style imports)</h2>
            <p style={{ fontSize: "12px", color: "#666", marginTop: "-10px" }}>
                Uses <code>import {"{ useState, useMemo }"} from "react"</code>
            </p>
            <p>Count: {count}</p>
            <p>Doubled: {doubled}</p>
            <p>
                Count × {multiplier} = {multiplied}
            </p>

            <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
                <button onClick={handleDecrement}>-</button>
                <button onClick={handleIncrement}>+</button>
                <button onClick={() => setMultiplier((prev) => prev + 1)}>Increase Multiplier</button>
            </div>
        </div>
    );
}
