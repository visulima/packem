// This example demonstrates using React-style imports with Preact
// All React imports are automatically aliased to preact/compat via the preset

import { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";

import { Counter } from "./components/Counter";
import { TodoList } from "./components/TodoList";

export function App() {
    const [showCounter, setShowCounter] = useState(true);
    const [mounted, setMounted] = useState(false);

    // Using React hooks - works via preact/compat alias
    useEffect(() => {
        setMounted(true);
        console.log("Component mounted using React-style useEffect!");
    }, []);

    return (
        <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
            <h1>Preact + React Compatibility Example</h1>
            <p>
                This example demonstrates using <strong>React-style imports</strong> with Preact.
            </p>
            <p style={{ color: "#666", fontSize: "14px" }}>
                All imports from <code>react</code> and <code>react-dom</code> are automatically
                aliased to <code>preact/compat</code> by the preset.
            </p>

            {mounted && (
                <div style={{ marginTop: "20px", padding: "10px", backgroundColor: "#e8f5e9", borderRadius: "4px" }}>
                    ✅ Component mounted successfully using React hooks!
                </div>
            )}

            <div style={{ marginTop: "20px", marginBottom: "20px" }}>
                <button onClick={() => setShowCounter(!showCounter)}>
                    {showCounter ? "Hide" : "Show"} Counter
                </button>
            </div>

            {showCounter && <Counter />}

            <TodoList />
        </div>
    );
}

// Using react-dom/client API - works via preact/compat alias
export function renderApp(element: HTMLElement) {
    const root = createRoot(element);
    root.render(<App />);
    return root;
}

export default App;
