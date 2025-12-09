<script lang="ts">
    import Counter from "./components/Counter.svelte";
    import TodoList from "./components/TodoList.svelte";

    let showCounter = $state(true);
</script>

<div style="padding: 20px; font-family: sans-serif">
    <h1>Svelte 5 + Packem Example</h1>
    <p>This example demonstrates Svelte 5 with Packem.</p>

    <div style="margin-bottom: 20px">
        <button onclick={() => (showCounter = !showCounter)}>
            {showCounter ? "Hide" : "Show"} Counter
        </button>
    </div>

    {#if showCounter}
        <Counter />
    {/if}

    <TodoList />
</div>
