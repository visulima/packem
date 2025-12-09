import { useState } from "react";

/**
 * Counter component - React Compiler will optimize memoization
 * This component demonstrates automatic memoization by React Compiler
 */
export function Counter() {
    const [count, setCount] = useState(0);
    const [multiplier, setMultiplier] = useState(1);

    // React Compiler will memoize this computation
    const doubled = count * 2;
    const multiplied = count * multiplier;

    // React Compiler will memoize this callback
    const handleIncrement = () => {
        setCount((prev) => prev + 1);
    };

    const handleDecrement = () => {
        setCount((prev) => prev - 1);
    };

    return (
        <div style={{ border: "1px solid #ccc", padding: "16px", marginBottom: "16px", borderRadius: "8px" }}>
            <h2>Counter Component</h2>
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



