<script>
  // Round colour buttons (bike colour, accent colour). Same markup and classes as before.
  let { colors, value, onchange } = $props();
  let current = $derived(value);
</script>

<div class="choices">
  {#each colors as c (c)}
    <button
      class="swatch"
      class:selected={c === current}
      style="background:{c}"
      aria-label={c}
      onclick={() => { current = c; onchange?.(c); }}
    ></button>
  {/each}
</div>
