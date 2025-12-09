import { createSignal, For } from "solid-js";

interface Todo {
    id: number;
    text: string;
    completed: boolean;
}

/**
 * TodoList component - Demonstrates SolidJS reactivity with arrays
 * Shows how SolidJS efficiently updates only changed items in lists
 */
export function TodoList() {
    const [todos, setTodos] = createSignal<Todo[]>([]);
    const [inputValue, setInputValue] = createSignal("");

    // SolidJS automatically tracks these computations
    const completedCount = () => todos().filter((todo) => todo.completed).length;
    const activeCount = () => todos().length - completedCount();

    const handleAddTodo = () => {
        const value = inputValue().trim();
        if (value) {
            setTodos((prev) => [
                ...prev,
                {
                    id: Date.now(),
                    text: value,
                    completed: false,
                },
            ]);
            setInputValue("");
        }
    };

    const handleToggleTodo = (id: number) => {
        setTodos((prev) => prev.map((todo) => (todo.id === id ? { ...todo, completed: !todo.completed } : todo)));
    };

    const handleDeleteTodo = (id: number) => {
        setTodos((prev) => prev.filter((todo) => todo.id !== id));
    };

    return (
        <div style={{ border: "1px solid #ccc", padding: "16px", "border-radius": "8px" }}>
            <h2>Todo List</h2>

            <div style={{ "margin-bottom": "12px" }}>
                <input
                    type="text"
                    value={inputValue()}
                    onInput={(e) => setInputValue(e.currentTarget.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            handleAddTodo();
                        }
                    }}
                    placeholder="Add a todo..."
                    style={{ padding: "8px", "margin-right": "8px", width: "200px" }}
                />
                <button onClick={handleAddTodo}>Add</button>
            </div>

            <div style={{ "margin-bottom": "12px", "font-size": "14px", color: "#666" }}>
                <span>Active: {activeCount()}</span>
                {" | "}
                <span>Completed: {completedCount()}</span>
            </div>

            <ul style={{ "list-style": "none", padding: 0 }}>
                <For each={todos()}>
                    {(todo) => (
                        <li
                            style={{
                                display: "flex",
                                "align-items": "center",
                                padding: "8px",
                                "margin-bottom": "4px",
                                "background-color": "#f5f5f5",
                                "border-radius": "4px",
                            }}
                        >
                            <input
                                type="checkbox"
                                checked={todo.completed}
                                onChange={() => handleToggleTodo(todo.id)}
                                style={{ "margin-right": "8px" }}
                            />
                            <span
                                style={{
                                    flex: 1,
                                    "text-decoration": todo.completed ? "line-through" : "none",
                                    color: todo.completed ? "#999" : "inherit",
                                }}
                            >
                                {todo.text}
                            </span>
                            <button onClick={() => handleDeleteTodo(todo.id)} style={{ "margin-left": "8px" }}>
                                Delete
                            </button>
                        </li>
                    )}
                </For>
            </ul>

            {todos().length === 0 && <p style={{ color: "#999", "font-style": "italic" }}>No todos yet. Add one above!</p>}
        </div>
    );
}



