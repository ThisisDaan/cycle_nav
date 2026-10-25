<script>
  import { icon } from '../icons.js';

  // A grid of icon buttons. variant 'choice' = the bike editor's row of larger buttons,
  // variant 'grid' = the pin editor's auto-fill grid. Same markup and classes as before.
  let { icons, value, onchange, variant = 'choice' } = $props();
  let current = $derived(value);
  const pick = i => { current = i; onchange?.(i); };
</script>

{#if variant === 'grid'}
  <div class="icon-grid">
    {#each icons as i (i)}
      <button type="button" class="icon-opt" class:selected={i === current} aria-label={i} onclick={() => pick(i)}>{@html icon(i, 22)}</button>
    {/each}
  </div>
{:else}
  <div class="choices">
    {#each icons as i (i)}
      <button class="choice icon-choice" class:selected={i === current} aria-label={i} onclick={() => pick(i)}>{@html icon(i, 24)}</button>
    {/each}
  </div>
{/if}
