import { useState } from "preact/hooks";

interface Todo {
    id: number;
    text: string;
    completed: boolean;
}

/**
 * TodoList component - Demonstrates Preact state management with arrays
 */
export function TodoList() {
    const [todos, setTodos] = useState<Todo[]>([]);
    const [inputValue, setInputValue] = useState("");

    const addTodo = () => {
        if (inputValue.trim()) {
            setTodos([
                ...todos,
                {
                    id: Date.now(),
                    text: inputValue.trim(),
                    completed: false,
                },
            ]);
            setInputValue("");
        }
    };

    const toggleTodo = (id: number) => {
        setTodos(
            todos.map((todo) => (todo.id === id ? { ...todo, completed: !todo.completed } : todo)),
        );
    };

    const deleteTodo = (id: number) => {
        setTodos(todos.filter((todo) => todo.id !== id));
    };

    return (
        <div style={{ border: "1px solid #ccc", padding: "16px", borderRadius: "8px" }}>
            <h2>Todo List</h2>

            <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
                <input
                    type="text"
                    value={inputValue}
                    onInput={(e) => setInputValue((e.target as HTMLInputElement).value)}
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

            {todos.length === 0 ? (
                <p style={{ color: "#666" }}>No todos yet. Add one above!</p>
            ) : (
                <ul style={{ listStyle: "none", padding: 0 }}>
                    {todos.map((todo) => (
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
