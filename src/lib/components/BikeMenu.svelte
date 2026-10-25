<script>
  import Popover from './Popover.svelte';
  import { app } from '../state.svelte.js';

  // The bikes to pick from in the route sheet, plus "Manage bikes". bikes.js fills app.bikeMenu
  // ({ open, anchor, items: [{ key, badge, color, name, sub, current, onpick }] }).
  let m = $derived(app.bikeMenu);
</script>

<Popover id="bikeMenu" class="bike-menu" open={m.open} anchor={m.anchor} side="above">
  {#each m.items as it (it.key)}
    <button class:current={it.current} onclick={it.onpick}>
      <span class="bike-badge" style="--bike:{it.color}">{@html it.badge}</span>
      <span><b>{it.name}</b>{#if it.sub}<small>{it.sub}</small>{/if}</span>
    </button>
  {/each}
</Popover>
