<script>
  import { app } from '../state.svelte.js';
  import { t } from '../i18n.js';
  import { icon, BOOKMARK_LINE_SVG, BOOKMARK_SVG } from '../icons.js';
  import { dist } from '../geo.js';
  import { isStation, placeLinks, trainPlanner } from '../placeinfo.js';
  import { S } from '../ui.js';

  // The same row on every place card: Save, Go via here (while planning), Call, Website, Train times.
  // It scrolls sideways if it gets long. `p` is the app.place object.
  let { p, onact } = $props();
  let saved = $derived((S().pins || []).some(x => dist(x.latlng, p.latlng) < 30));
  let l = $derived(placeLinks(p.tags));
  let links = $derived([l.tel && { href: l.tel, ic: 'phone', label: 'Call' }, l.site && { href: l.site, ic: 'language', label: 'Website', ext: true },
    (p.station || isStation(p.tags)) && { href: trainPlanner(p.name, p.latlng, p.tags?.['addr:country']), ic: 'train', label: 'Train times', ext: true }].filter(Boolean));
</script>

<div class="place-pills">
  <button class="place-pill" class:saved onclick={() => onact('pin')}>{@html saved ? BOOKMARK_SVG : BOOKMARK_LINE_SVG} {t(saved ? 'Saved' : 'Save')}</button>
  {#if app.options.length && !app.nav}
    <button class="place-pill" onclick={() => onact('via')}>{@html icon('add')} {t('Go via here')}</button>
  {/if}
  {#each links as k (k.label)}
    <a class="place-pill" href={k.href} target={k.ext ? '_blank' : undefined} rel={k.ext ? 'noopener noreferrer' : undefined}>{@html icon(k.ic)} {t(k.label)}</a>
  {/each}
</div>
