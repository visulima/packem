<template>
    <div style="border: 1px solid #ccc; padding: 16px; margin-bottom: 16px; border-radius: 8px">
        <h2>Counter Component</h2>
        <p>Count: {{ count }}</p>
        <p>Doubled: {{ doubled }}</p>
        <p>Count × {{ multiplier }} = {{ multiplied }}</p>

        <div style="display: flex; gap: 8px; margin-top: 12px">
            <button @click="handleDecrement">-</button>
            <button @click="handleIncrement">+</button>
            <button @click="multiplier++">Increase Multiplier</button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";

/**
 * Counter component - Demonstrates Vue 3 Composition API
 * Shows reactive state management with refs and computed properties
 */
const count = ref(0);
const multiplier = ref(1);

// Vue automatically tracks dependencies in computed properties
const doubled = computed(() => count.value * 2);
const multiplied = computed(() => count.value * multiplier.value);

const handleIncrement = () => {
    count.value++;
};

const handleDecrement = () => {
    count.value--;
};
</script>
