<template>
    <div style="padding: 20px; font-family: sans-serif">
        <h1>Vue 3 + Packem Example</h1>
        <p>This example demonstrates Vue 3 Single File Components (SFCs) with Packem.</p>

        <div style="margin-bottom: 20px">
            <button @click="showCounter = !showCounter">
                {{ showCounter ? "Hide" : "Show" }} Counter
            </button>
        </div>

        <Counter v-if="showCounter" />

        <TodoList />
    </div>
</template>

<script setup lang="ts">
import { ref } from "vue";

import Counter from "./components/Counter.vue";
import TodoList from "./components/TodoList.vue";

const showCounter = ref(true);
</script>
