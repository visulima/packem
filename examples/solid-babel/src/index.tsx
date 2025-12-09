import { createSignal } from "solid-js";

import { Counter } from "./components/Counter";
import { TodoList } from "./components/TodoList";

export function App() {
    const [showCounter, setShowCounter] = createSignal(true);

    return (
        <div style={{ padding: "20px", "font-family": "sans-serif" }}>
            <h1>SolidJS + Babel Example</h1>
            <p>This example demonstrates SolidJS with Babel preset for JSX transformation.</p>

            <div style={{ "margin-bottom": "20px" }}>
                <button onClick={() => setShowCounter(!showCounter())}>
                    {showCounter() ? "Hide" : "Show"} Counter
                </button>
            </div>

            {showCounter() && <Counter />}

            <TodoList />
        </div>
    );
}

export default App;
