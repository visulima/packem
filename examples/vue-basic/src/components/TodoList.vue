<template>
    <div style="border: 1px solid #ccc; padding: 16px; border-radius: 8px">
        <h2>Todo List</h2>

        <div style="margin-bottom: 12px">
            <input
                v-model="inputValue"
                type="text"
                placeholder="Add a todo..."
                style="padding: 8px; margin-right: 8px; width: 200px"
                @keydown.enter="handleAddTodo"
            />
            <button @click="handleAddTodo">Add</button>
        </div>

        <div style="margin-bottom: 12px; font-size: 14px; color: #666">
            <span>Active: {{ activeCount }}</span>
            <span> | </span>
            <span>Completed: {{ completedCount }}</span>
        </div>

        <ul style="list-style: none; padding: 0">
            <li
                v-for="todo in todos"
                :key="todo.id"
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
                    :checked="todo.completed"
                    style="margin-right: 8px"
                    @change="handleToggleTodo(todo.id)"
                />
                <span
                    :style="{
                        flex: 1,
                        textDecoration: todo.completed ? 'line-through' : 'none',
                        color: todo.completed ? '#999' : 'inherit',
                    }"
                >
                    {{ todo.text }}
                </span>
                <button @click="handleDeleteTodo(todo.id)" style="margin-left: 8px">Delete</button>
            </li>
        </ul>

        <p v-if="todos.length === 0" style="color: #999; font-style: italic">
            No todos yet. Add one above!
        </p>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";

interface Todo {
    id: number;
    text: string;
    completed: boolean;
}

/**
 * TodoList component - Demonstrates Vue 3 reactivity with arrays
 * Shows how Vue efficiently updates only changed items in lists
 */
const todos = ref<Todo[]>([]);
const inputValue = ref("");

// Vue automatically tracks dependencies in computed properties
const completedCount = computed(() => todos.value.filter((todo) => todo.completed).length);
const activeCount = computed(() => todos.value.length - completedCount.value);

const handleAddTodo = () => {
    const value = inputValue.value.trim();
    if (value) {
        todos.value.push({
            id: Date.now(),
            text: value,
            completed: false,
        });
        inputValue.value = "";
    }
};

const handleToggleTodo = (id: number) => {
    const todo = todos.value.find((t) => t.id === id);
    if (todo) {
        todo.completed = !todo.completed;
    }
};

const handleDeleteTodo = (id: number) => {
    todos.value = todos.value.filter((todo) => todo.id !== id);
};
</script>
