<script>
  import RouteCard from './RouteCard.svelte';
  import { app } from '../state.svelte.js';
  import { t } from '../i18n.js';

  // The route sheet's status line and the list of route cards, drawn from app.options / app.selected.
  //   ui  { click(event, i), reset() } from routing-ui.js (loaded after the map exists)
  let { ui = null } = $props();

  // a busy router shows a live countdown; routing-ui.js plans again when the pause is over
  let now = $state(Date.now());
  let until = $derived(app.routeMsg?.busyUntil || 0);
  $effect(() => {
    if (!until) return;
    now = Date.now();
    const id = setInterval(() => { now = Date.now(); }, 500);
    return () => clearInterval(id);
  });
  let left = $derived(Math.max(0, Math.ceil((until - now) / 1000)));
</script>

<div id="routeStatus" class="route-status">
  {#if app.routeMsg}
    {#if app.routeMsg.spin}<span class="spinner"></span>{/if}{#if until}{left > 0 ? t('The route server is busy. Trying again in {0} s', left) : t('Finding calm routes…')}{:else}{app.routeMsg.text}{/if}
  {:else if app.gpxRoute ? app.gpxRoute.edited || app.vias.some(v => !v.gpx) : app.vias.length}
    <button class="link-btn" id="resetVias" onclick={() => ui?.reset()}>Undo my changes</button>
  {:else}
    <span class="route-hint">{app.gpxRoute ? t('Drag the dots on the route to change it') : t('Drag the green line to change the route')}</span>
  {/if}
</div>
<div id="routeCards" class="route-cards">
  {#if app.cardsOn}
    {#each app.options as o, i (i)}
      <RouteCard {o} {i} selected={i === app.selected} onclick={(e, k) => ui?.click(e, k)} />
    {/each}
  {/if}
</div>
