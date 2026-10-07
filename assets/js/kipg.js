const root = new URL('../../', import.meta.url);
const watchUrl = id => new URL(`pages/watch.html?episode=${encodeURIComponent(id)}`, root).href;
const validId = id => typeof id === 'string' && /^[\w-]{11}$/.test(id);
const topicLabels = {'biblical-truth':'Biblical Truth',relationships:'Relationships',purpose:'Purpose',hope:'Hope & encouragement'};
function topicsFor(item) {
  if (Array.isArray(item.topics)) return item.topics;
  const text = `${item.title} ${item.description || ''}`.toLowerCase();
  return Object.entries({'biblical-truth':/god|faith|biblical|ministry|character|gifting/,relationships:/friend|relationship|gossip|slander|hurtful/,purpose:/business|purpose|music|omega|gifting/,hope:/joy|empty|grief|hurtful|hope|quit/}).filter(([,regex])=>regex.test(text)).map(([topic])=>topic);
}
async function getEpisodes() {
  const response = await fetch(new URL('data/latest-kipg-episode.json', root), {cache:'no-store'});
  if (!response.ok) throw new Error('Episode data unavailable');
  const data = await response.json();
  const seen = new Set();
  const items = (data.episodes || data.recentEpisodes || [data]).filter(item => {
    if (!validId(item.videoId) || seen.has(item.videoId) || ['live','upcoming'].includes(item.liveBroadcastContent)) return false;
    seen.add(item.videoId); return true;
  }).map(item => ({...item, topics:topicsFor(item)}));
  if (!items.length) throw new Error('No completed episodes available');
  return {data,items};
}
function episodeCard(item) {
  const card = document.createElement('a');
  card.className = 'kipg-episode-card'; card.href = watchUrl(item.videoId);
  const art = document.createElement('div'); art.className = 'kipg-episode-card__art';
  const img = document.createElement('img');
  img.src = `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`; img.alt = ''; img.loading = 'lazy';
  const title = document.createElement('strong'); title.textContent = item.title;
  art.append(img,title);
  const meta = document.createElement('div'); meta.className='kipg-episode-card__meta';
  meta.textContent = `${item.episodeNumber ? `Episode ${item.episodeNumber} · `:''}KIPG Podcast`;
  card.append(art,meta); return card;
}
function featured(data,items) {
  const item = items.find(item=>item.videoId===data.videoId) || items[0];
  const card=document.querySelector('[data-youtube-featured]');
  if (!card) return;
  card.querySelector('[data-youtube-thumbnail]').style.backgroundImage=`url("https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg")`;
  document.querySelector('[data-featured-title]').textContent=item.title;
  document.querySelector('[data-featured-meta]').textContent=`KIPG PODCAST${item.episodeNumber ? ` · EPISODE ${item.episodeNumber}`:''}`;
  document.querySelector('[data-featured-description]').textContent=data.description || 'An honest conversation about faith and real life.';
  const link=document.querySelector('[data-featured-watch]'); link.href=watchUrl(item.videoId);
  card.querySelector('.kipg-feature-play').addEventListener('click',()=>location.assign(link.href));
  const recent=document.querySelector('[data-recent-episodes]');
  if(recent) recent.replaceChildren(...items.slice(0,4).map(episodeCard));
}
function player(data,items) {
  const container=document.querySelector('[data-watch-player]');
  if (!container) return;
  const requested=new URL(location.href).searchParams.get('episode');
  const item=requested ? items.find(item=>item.videoId===requested) : items.find(item=>item.videoId===data.videoId) || items[0];
  if(!item) {
    container.textContent='This episode is unavailable. Choose another conversation below.';
    document.querySelector('[data-watch-title]').textContent='Episode unavailable'; return;
  }
  const frame=document.createElement('iframe'); frame.className='kipg-youtube-player';
  frame.src=`https://www.youtube-nocookie.com/embed/${item.videoId}`; frame.title=item.title;
  frame.allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
  frame.referrerPolicy='strict-origin-when-cross-origin';frame.allowFullscreen=true;
  container.replaceChildren(frame);
  document.querySelector('[data-watch-title]').textContent=item.title;
  document.querySelector('[data-watch-meta]').textContent=`KIPG Podcast${item.episodeNumber ? ` · Episode ${item.episodeNumber}`:''}`;
  document.querySelector('[data-watch-description]').textContent=item.description || (item.videoId===data.videoId ? data.description : '') || 'Join PG and Troy for an honest conversation about faith and everyday life.';
  document.querySelector('[data-watch-youtube]').href=`https://www.youtube.com/watch?v=${item.videoId}`;
  document.title=`${item.title} | KIPG Network`;
}
function library(items) {
  const grid=document.querySelector('[data-episode-library]'); if(!grid) return;
  const form=document.querySelector('[data-episode-search]');
  const query=form.elements.q, topic=form.elements.topic;
  const params=new URL(location.href).searchParams;
  query.value=params.get('q')||'';
  topic.value=Object.hasOwn(topicLabels,params.get('topic')) ? params.get('topic') : '';
  const render=()=>{
    const text=query.value.trim().toLowerCase();
    const results=items.filter(item=>(!topic.value || item.topics.includes(topic.value)) && `${item.title} ${item.description || ''} ${item.episodeNumber || ''}`.toLowerCase().includes(text));
    grid.replaceChildren(...results.map(episodeCard));
    document.querySelector('[data-episode-count]').textContent=results.length ? `${results.length} ${results.length===1 ? 'episode':'episodes'}` : 'No episodes match. Try a different search or topic.';
    const url=new URL(location.href);
    for(const [key,value] of [['q',query.value],['topic',topic.value]]) value ? url.searchParams.set(key,value) : url.searchParams.delete(key);
    history.replaceState(null,'',url);
  };
  form.addEventListener('submit',event=>event.preventDefault());
  query.addEventListener('input',render); topic.addEventListener('change',render); render();
}
// Derive the next Wednesday in New York time, including DST boundaries.
export function nextWednesday(now = new Date()) {
  const fmt=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'});
  const parts=Object.fromEntries(fmt.formatToParts(now).map(p=>[p.type,p.value]));
  const day=new Date(Date.UTC(+parts.year,+parts.month-1,+parts.day));
  let delta=(3-day.getUTCDay()+7)%7;
  if(delta===0 && +parts.hour>=19) delta=7;
  day.setUTCDate(day.getUTCDate()+delta); day.setUTCHours(19);
  let instant=new Date(day);
  for(let i=0;i<2;i++) {
    const p=Object.fromEntries(fmt.formatToParts(instant).map(p=>[p.type,p.value]));
    const wall=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour);
    instant=new Date(instant.getTime()+day.getTime()-wall);
  }
  return instant;
}
function schedule() {
  const el=document.querySelector('[data-next-show]'); if(!el) return;
  const date=nextWednesday();
  el.textContent=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'long',month:'long',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(date);
  document.querySelector('[data-local-show]').textContent=`Your local time: ${new Intl.DateTimeFormat(undefined,{dateStyle:'full',timeStyle:'short'}).format(date)}`;
  document.querySelector('[data-calendar-download]').addEventListener('click',()=>{
    const stamp=d=>d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
    const content=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//KIPG Network//Weekly show//EN','BEGIN:VEVENT',`UID:kipg-${stamp(date)}@kipgnetwork.com`,`DTSTAMP:${stamp(new Date())}`,`DTSTART:${stamp(date)}`,`DTEND:${stamp(new Date(date.getTime()+3600000))}`,'SUMMARY:KIPG Podcast','DESCRIPTION:Real topics. Real conversations. Real answers.',`URL:${new URL('pages/watch.html',root).href}`,'END:VEVENT','END:VCALENDAR',''].join('\r\n');
    const url=URL.createObjectURL(new Blob([content],{type:'text/calendar;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download='KIPG-Podcast.ics';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
}
async function load() {
  try {
    const {data,items}=await getEpisodes();featured(data,items);player(data,items);library(items);
    const error=document.querySelector('[data-library-error]');if(error) error.hidden=true;
  } catch {
    const error=document.querySelector('[data-library-error]');if(error) error.hidden=false;
    const count=document.querySelector('[data-episode-count]');if(count) count.textContent='Episode library unavailable.';
    const player=document.querySelector('[data-watch-player]');if(player) player.textContent='The player could not be loaded. Try again below or watch the full playlist on YouTube.';
    const btn=document.querySelector('.kipg-feature-play');if(btn) {btn.disabled=true;btn.setAttribute('aria-label','Featured episode unavailable');}
    const title=document.querySelector('[data-featured-title]');if(title) title.textContent='Explore KIPG Podcast';
  }
}
function mobileNavigation(){
  const header=document.querySelector('.kipg-header'),topbar=header?.querySelector('.kipg-topbar');
  const navigation=document.querySelector('.kipg-pearl-nav__inner');
  const actions=header?.querySelector('.kipg-topbar__actions');
  if(!topbar||!navigation||!actions)return;
  const toggle=document.createElement('button');
  toggle.type='button';toggle.className='ec-icon-button kipg-menu-toggle';
  toggle.textContent='☰';toggle.setAttribute('aria-label','Open navigation menu');
  toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls','kipg-mobile-menu');
  const panel=document.createElement('div');panel.id='kipg-mobile-menu';panel.className='kipg-mobile-menu';panel.hidden=true;
  const links=document.createElement('nav');links.setAttribute('aria-label','Mobile navigation');
  navigation.querySelectorAll('a').forEach(link=>links.append(link.cloneNode(true)));
  const extras=document.createElement('div');extras.className='kipg-mobile-menu__extras';
  panel.append(links,extras);topbar.append(toggle);header.append(panel);
  const theme=actions.querySelector('.kipg-theme'),join=actions.querySelector('.kipg-join');
  const media=window.matchMedia('(max-width:768px)');
  const close=(focus=false)=>{panel.hidden=true;toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','Open navigation menu');if(focus)toggle.focus();};
  const sync=()=>{
    close();
    if(media.matches){if(join)extras.append(join);if(theme)extras.append(theme);}
    else {if(theme)actions.append(theme);if(join)actions.append(join);}
  };
  toggle.addEventListener('click',()=>{
    const open=panel.hidden;panel.hidden=!open;toggle.setAttribute('aria-expanded',String(open));
    toggle.setAttribute('aria-label',open?'Close navigation menu':'Open navigation menu');
  });
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden)close(true);});
  document.addEventListener('click',event=>{if(!panel.hidden&&!header.contains(event.target))close();});
  panel.addEventListener('click',event=>{if(event.target.closest('a'))close();});
  header.addEventListener('focusout',()=>setTimeout(()=>{if(!header.contains(document.activeElement))close();},0));
  media.addEventListener('change',sync);sync();
  document.documentElement.classList.add('kipg-mobile-nav-ready');
}
function init(){
  mobileNavigation();
  const header=document.querySelector('.kipg-header');
  if(header){
    const sizeHeader=()=>document.documentElement.style.setProperty('--kipg-header-height',`${header.getBoundingClientRect().height}px`);
    sizeHeader();
    if(typeof ResizeObserver!=='undefined')new ResizeObserver(sizeHeader).observe(header);
    else window.addEventListener('resize',sizeHeader);
  }
  document.querySelectorAll('[data-recent-episodes], [data-episode-library]').forEach(row=>{
    row.tabIndex=0;
    row.setAttribute('role','region');
    row.setAttribute('aria-label','Episodes. Swipe sideways or use arrow keys to browse.');
    const controls=document.createElement('div');controls.className='kipg-swipe-hint';
    const hint=document.createElement('span');hint.textContent='Swipe to browse episodes';
    const previous=document.createElement('button'),next=document.createElement('button');
    for(const [button,label,text] of [[previous,'Previous episode','←'],[next,'Next episode','→']]){
      button.type='button';button.className='ec-icon-button';button.setAttribute('aria-label',label);button.textContent=text;
    }
    controls.append(hint,previous,next);row.before(controls);
    const move=direction=>row.scrollBy({left:direction*((row.firstElementChild?.getBoundingClientRect().width||row.clientWidth)+parseFloat(getComputedStyle(row).gap||0)),behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
    const update=()=>{previous.disabled=row.scrollLeft<=2;next.disabled=row.scrollLeft>=row.scrollWidth-row.clientWidth-2;};
    previous.addEventListener('click',()=>move(-1));next.addEventListener('click',()=>move(1));
    row.addEventListener('scroll',update,{passive:true});
    new MutationObserver(()=>{row.scrollLeft=0;update();}).observe(row,{childList:true});
    new ResizeObserver(update).observe(row);update();
    row.addEventListener('keydown',event=>{
      if(event.target!==row||!['ArrowLeft','ArrowRight'].includes(event.key)||row.scrollWidth<=row.clientWidth)return;
      event.preventDefault();
      move(event.key==='ArrowRight'?1:-1);
    });
  });
  document.querySelectorAll('[data-current-year]').forEach(el=>el.textContent=new Date().getFullYear());
  schedule();
  if(document.querySelector('[data-youtube-featured], [data-episode-library]')) load();
  document.querySelector('[data-retry-episodes]')?.addEventListener('click',load);
}
if(typeof document!=='undefined') {
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
}
