// Using React-style imports - automatically resolved to preact/compat
import { useState, useCallback, useMemo } from "react";

interface Todo {
    id: number;
    text: string;
    completed: boolean;
}

/**
 * TodoList component - Demonstrates React hooks with Preact
 * Shows that React patterns work seamlessly with Preact via aliases
 */
export function TodoList() {
    // Using React useState - works via preact/compat alias
    const [todos, setTodos] = useState<Todo[]>([]);
    const [inputValue, setInputValue] = useState("");
    const [filter, setFilter] = useState<"all" | "active" | "completed">("all");

    // Using React useCallback - works via preact/compat alias
    const addTodo = useCallback(() => {
        if (inputValue.trim()) {
            setTodos((prev) => [
                ...prev,
                {
                    id: Date.now(),
                    text: inputValue.trim(),
                    completed: false,
                },
            ]);
            setInputValue("");
        }
    }, [inputValue]);

    const toggleTodo = useCallback((id: number) => {
        setTodos((prev) => prev.map((todo) => (todo.id === id ? { ...todo, completed: !todo.completed } : todo)));
    }, []);

    const deleteTodo = useCallback((id: number) => {
        setTodos((prev) => prev.filter((todo) => todo.id !== id));
    }, []);

    // Using React useMemo - works via preact/compat alias
    const filteredTodos = useMemo(() => {
        switch (filter) {
            case "active":
                return todos.filter((todo) => !todo.completed);
            case "completed":
                return todos.filter((todo) => todo.completed);
            default:
                return todos;
        }
    }, [todos, filter]);

    return (
        <div style={{ border: "1px solid #ccc", padding: "16px", borderRadius: "8px" }}>
            <h2>Todo List (React-style imports)</h2>
            <p style={{ fontSize: "12px", color: "#666", marginTop: "-10px" }}>
                Uses <code>import {"{ useState, useCallback, useMemo }"} from "react"</code>
            </p>

            <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
                <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue((e.target as HTMLInputElement).value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            addTodo();
                        }
                    }}
                    placeholder="Add a todo..."
                    style={{ flex: 1, padding: "8px" }}
                />
                <button onClick={addTodo}>Add</button>
            </div>

            <div style={{ marginBottom: "16px", display: "flex", gap: "8px" }}>
                <button
                    onClick={() => setFilter("all")}
                    style={{
                        backgroundColor: filter === "all" ? "#2196F3" : "#f5f5f5",
                        color: filter === "all" ? "white" : "black",
                    }}
                >
                    All
                </button>
                <button
                    onClick={() => setFilter("active")}
                    style={{
                        backgroundColor: filter === "active" ? "#2196F3" : "#f5f5f5",
                        color: filter === "active" ? "white" : "black",
                    }}
                >
                    Active
                </button>
                <button
                    onClick={() => setFilter("completed")}
                    style={{
                        backgroundColor: filter === "completed" ? "#2196F3" : "#f5f5f5",
                        color: filter === "completed" ? "white" : "black",
                    }}
                >
                    Completed
                </button>
            </div>

            {filteredTodos.length === 0 ? (
                <p style={{ color: "#666" }}>
                    {todos.length === 0 ? "No todos yet. Add one above!" : `No ${filter} todos.`}
                </p>
            ) : (
                <ul style={{ listStyle: "none", padding: 0 }}>
                    {filteredTodos.map((todo) => (
                        <li
                            key={todo.id}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                                padding: "8px",
                                marginBottom: "4px",
                                backgroundColor: "#f5f5f5",
                                borderRadius: "4px",
                            }}
                        >
                            <input
                                type="checkbox"
                                checked={todo.completed}
                                onChange={() => toggleTodo(todo.id)}
                            />
                            <span
                                style={{
                                    flex: 1,
                                    textDecoration: todo.completed ? "line-through" : "none",
                                    color: todo.completed ? "#999" : "#000",
                                }}
                            >
                                {todo.text}
                            </span>
                            <button onClick={() => deleteTodo(todo.id)}>Delete</button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
