<script>
  import RouteCard from './RouteCard.svelte';
  import { app } from '../state.svelte.js';

  // The route sheet's status line and the list of route cards, drawn from app.options / app.selected.
  //   ui  { click(event, i), reset() } from routing-ui.js (loaded after the map exists)
  let { ui = null } = $props();
</script>

<div id="routeStatus" class="route-status">
  {#if app.routeMsg}
    {#if app.routeMsg.spin}<span class="spinner"></span>{/if}{app.routeMsg.text}
  {:else if app.vias.length}
    <button class="link-btn" id="resetVias" onclick={() => ui?.reset()}>Undo my changes</button>
  {:else}
    <span class="route-hint">Drag the green line to change the route</span>
  {/if}
</div>
<div id="routeCards" class="route-cards">
  {#if app.cardsOn}
    {#each app.options as o, i (i)}
      <RouteCard {o} {i} selected={i === app.selected} onclick={(e, k) => ui?.click(e, k)} />
    {/each}
  {/if}
</div>
