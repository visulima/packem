<script lang="ts">
    /**
     * Counter component - Demonstrates Svelte 5 runes
     * Shows reactive state management with $state
     */
    let count = $state(0);
    let multiplier = $state(1);

    // Svelte automatically tracks dependencies in reactive statements
    let doubled = $derived(count * 2);
    let multiplied = $derived(count * multiplier);

    function handleIncrement() {
        count++;
    }

    function handleDecrement() {
        count--;
    }
</script>

<div style="border: 1px solid #ccc; padding: 16px; margin-bottom: 16px; border-radius: 8px">
    <h2>Counter Component</h2>
    <p>Count: {count}</p>
    <p>Doubled: {doubled}</p>
    <p>Count × {multiplier} = {multiplied}</p>

    <div style="display: flex; gap: 8px; margin-top: 12px">
        <button onclick={handleDecrement}>-</button>
        <button onclick={handleIncrement}>+</button>
        <button onclick={() => multiplier++}>Increase Multiplier</button>
    </div>
</div>
