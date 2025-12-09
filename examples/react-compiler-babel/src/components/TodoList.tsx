import { useState } from "react";

interface Todo {
    id: number;
    text: string;
    completed: boolean;
}

/**
 * TodoList component - React Compiler will optimize this component
 * Demonstrates React Compiler's ability to optimize complex state updates
 */
export function TodoList() {
    const [todos, setTodos] = useState<Todo[]>([]);
    const [inputValue, setInputValue] = useState("");

    // React Compiler will memoize this filtered computation
    const completedCount = todos.filter((todo) => todo.completed).length;
    const activeCount = todos.length - completedCount;

    // React Compiler will optimize these callbacks
    const handleAddTodo = () => {
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
    };

    const handleToggleTodo = (id: number) => {
        setTodos((prev) => prev.map((todo) => (todo.id === id ? { ...todo, completed: !todo.completed } : todo)));
    };

    const handleDeleteTodo = (id: number) => {
        setTodos((prev) => prev.filter((todo) => todo.id !== id));
    };

    return (
        <div style={{ border: "1px solid #ccc", padding: "16px", borderRadius: "8px" }}>
            <h2>Todo List</h2>

            <div style={{ marginBottom: "12px" }}>
                <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            handleAddTodo();
                        }
                    }}
                    placeholder="Add a todo..."
                    style={{ padding: "8px", marginRight: "8px", width: "200px" }}
                />
                <button onClick={handleAddTodo}>Add</button>
            </div>

            <div style={{ marginBottom: "12px", fontSize: "14px", color: "#666" }}>
                <span>Active: {activeCount}</span>
                {" | "}
                <span>Completed: {completedCount}</span>
            </div>

            <ul style={{ listStyle: "none", padding: 0 }}>
                {todos.map((todo) => (
                    <li
                        key={todo.id}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            padding: "8px",
                            marginBottom: "4px",
                            backgroundColor: "#f5f5f5",
                            borderRadius: "4px",
                        }}
                    >
                        <input
                            type="checkbox"
                            checked={todo.completed}
                            onChange={() => handleToggleTodo(todo.id)}
                            style={{ marginRight: "8px" }}
                        />
                        <span
                            style={{
                                flex: 1,
                                textDecoration: todo.completed ? "line-through" : "none",
                                color: todo.completed ? "#999" : "inherit",
                            }}
                        >
                            {todo.text}
                        </span>
                        <button onClick={() => handleDeleteTodo(todo.id)} style={{ marginLeft: "8px" }}>
                            Delete
                        </button>
                    </li>
                ))}
            </ul>

            {todos.length === 0 && <p style={{ color: "#999", fontStyle: "italic" }}>No todos yet. Add one above!</p>}
        </div>
    );
}



