<script>
  import Popover from './Popover.svelte';
  import { app } from '../state.svelte.js';
  import { icon } from '../icons.js';

  // Find nearby: what to look for, plus Clear while a search is showing. nearby.js fills
  // app.nearbyMenu ({ open, anchor, items: [{ key, ic, label, current, clear, onpick }] }).
  let m = $derived(app.nearbyMenu);
</script>

<Popover id="nearbyMenu" class="nearby-menu" role="menu" open={m.open} anchor={m.anchor} side="beside">
  {#each m.items as it (it.key)}
    <button role="menuitem" class:current={it.current} class:nearby-clear={it.clear} onclick={it.onpick}>
      {@html icon(it.ic, 22)}<span><b>{it.label}</b></span>
    </button>
  {/each}
</Popover>
