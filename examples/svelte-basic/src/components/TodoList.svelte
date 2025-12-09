<script lang="ts">
    interface Todo {
        id: number;
        text: string;
        completed: boolean;
    }

    /**
     * TodoList component - Demonstrates Svelte 5 reactivity with arrays
     * Shows how Svelte efficiently updates only changed items in lists
     */
    let todos = $state<Todo[]>([]);
    let inputValue = $state("");

    // Svelte automatically tracks dependencies in reactive statements
    let completedCount = $derived(todos.filter((todo) => todo.completed).length);
    let activeCount = $derived(todos.length - completedCount);

    function handleAddTodo() {
        const value = inputValue.trim();
        if (value) {
            todos = [
                ...todos,
                {
                    id: Date.now(),
                    text: value,
                    completed: false,
                },
            ];
            inputValue = "";
        }
    }

    function handleToggleTodo(id: number) {
        todos = todos.map((todo) => (todo.id === id ? { ...todo, completed: !todo.completed } : todo));
    }

    function handleDeleteTodo(id: number) {
        todos = todos.filter((todo) => todo.id !== id);
    }
</script>

<div style="border: 1px solid #ccc; padding: 16px; border-radius: 8px">
    <h2>Todo List</h2>

    <div style="margin-bottom: 12px">
        <input
            type="text"
            bind:value={inputValue}
            placeholder="Add a todo..."
            style="padding: 8px; margin-right: 8px; width: 200px"
            onkeydown={(e) => {
                if (e.key === "Enter") {
                    handleAddTodo();
                }
            }}
        />
        <button onclick={handleAddTodo}>Add</button>
    </div>

    <div style="margin-bottom: 12px; font-size: 14px; color: #666">
        <span>Active: {activeCount}</span>
        <span> | </span>
        <span>Completed: {completedCount}</span>
    </div>

    <ul style="list-style: none; padding: 0">
        {#each todos as todo (todo.id)}
            <li
                style="
                    display: flex;
                    align-items: center;
                    padding: 8px;
                    margin-bottom: 4px;
                    background-color: #f5f5f5;
                    border-radius: 4px;
                "
            >
                <input
                    type="checkbox"
                    checked={todo.completed}
                    style="margin-right: 8px"
                    onchange={() => handleToggleTodo(todo.id)}
                />
                <span
                    style="
                        flex: 1;
                        text-decoration: {todo.completed ? 'line-through' : 'none'};
                        color: {todo.completed ? '#999' : 'inherit'};
                    "
                >
                    {todo.text}
                </span>
                <button onclick={() => handleDeleteTodo(todo.id)} style="margin-left: 8px">Delete</button>
            </li>
        {/each}
    </ul>

    {#if todos.length === 0}
        <p style="color: #999; font-style: italic">No todos yet. Add one above!</p>
    {/if}
</div>
