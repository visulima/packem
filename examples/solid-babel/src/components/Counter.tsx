import { createSignal } from "solid-js";

/**
 * Counter component - Demonstrates SolidJS reactivity
 * SolidJS automatically tracks dependencies and updates only what's needed
 */
export function Counter() {
    const [count, setCount] = createSignal(0);
    const [multiplier, setMultiplier] = createSignal(1);

    // SolidJS automatically tracks these computations
    const doubled = () => count() * 2;
    const multiplied = () => count() * multiplier();

    const handleIncrement = () => {
        setCount((prev) => prev + 1);
    };

    const handleDecrement = () => {
        setCount((prev) => prev - 1);
    };

    return (
        <div style={{ border: "1px solid #ccc", padding: "16px", "margin-bottom": "16px", "border-radius": "8px" }}>
            <h2>Counter Component</h2>
            <p>Count: {count()}</p>
            <p>Doubled: {doubled()}</p>
            <p>
                Count × {multiplier()} = {multiplied()}
            </p>

            <div style={{ display: "flex", gap: "8px", "margin-top": "12px" }}>
                <button onClick={handleDecrement}>-</button>
                <button onClick={handleIncrement}>+</button>
                <button onClick={() => setMultiplier((prev) => prev + 1)}>Increase Multiplier</button>
            </div>
        </div>
    );
}



