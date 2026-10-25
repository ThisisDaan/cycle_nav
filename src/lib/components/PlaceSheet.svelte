<script>
  import Sheet from './Sheet.svelte';
  import PlacePills from './PlacePills.svelte';
  import { app } from '../state.svelte.js';
  import { t } from '../i18n.js';
  import { icon } from '../icons.js';
  import { detailsHtml } from '../placeinfo.js';

  // The tapped-place card. openPlaceSheet() in placesheet.js puts the place in app.place
  // ({ latlng, name, sub, tags, loading, fade, station }) and shows/hides the sheet; the content
  // stays after closing so it doesn't blank while the sheet slides out.
  //   ui  { act(a), close() } from placesheet.js (loaded after the map exists)
  let { ui = null } = $props();
  let p = $derived(app.place);
  let body = $state(null);

  // details fade in once the online lookup has answered
  $effect(() => {
    if (!body || !p?.fade || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    body.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'ease-out' });
  });
</script>

<Sheet id="placeSheet" class="sheet place-sheet">
  <div class="place-head">
    <div><div id="placeName" class="pick-name">{p?.name ?? ''}</div><div id="placeType" class="pick-info">{p?.sub ?? ''}</div></div>
    <button id="placeClose" class="icon-btn" aria-label="Close" onclick={() => ui?.close()}>{@html icon('close', 20)}</button>
  </div>
  <div id="placeBody" bind:this={body}>
    {#if p?.loading}
      <small class="pp-loading">{t('Loading details…')}</small>
    {:else if p?.tags}
      {@html detailsHtml(p.tags)}
    {/if}
  </div>
  <div id="placeActions" class="sheet-actions">
    {#if p}
      <PlacePills {p} onact={a => ui?.act(a)} />
      {#if app.nav}
        {#if !app.nav.recordOnly}<button class="primary-btn" onclick={() => ui?.act('stop')}>{t('Add as stop')}</button>{/if}
      {:else}
        <button class="primary-btn" onclick={() => ui?.act('to')}>{t('Directions')}</button>
      {/if}
    {/if}
  </div>
</Sheet>
