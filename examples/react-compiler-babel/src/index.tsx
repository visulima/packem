import { useState } from "react";

import { Counter } from "./components/Counter";
import { TodoList } from "./components/TodoList";

export function App() {
    const [showCounter, setShowCounter] = useState(true);

    return (
        <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
            <h1>React Compiler + Babel Example</h1>
            <p>This example demonstrates React Compiler optimization via Babel plugin.</p>

            <div style={{ marginBottom: "20px" }}>
                <button onClick={() => setShowCounter(!showCounter)}>
                    {showCounter ? "Hide" : "Show"} Counter
                </button>
            </div>

            {showCounter && <Counter />}

            <TodoList />
        </div>
    );
}

export default App;
