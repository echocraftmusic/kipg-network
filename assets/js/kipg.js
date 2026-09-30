const setYear = () => {
  document.querySelectorAll('[data-current-year]').forEach(el => el.textContent = new Date().getFullYear());
};

const setCountdown = () => {
  const el = document.querySelector('[data-premiere-countdown]');
  if (!el) return;
  const target = el.dataset.premiereCountdown;
  if (!target) return;
  const update = () => {
    const ms = new Date(target).getTime() - Date.now();
    if (ms <= 0) {
      el.textContent = 'Live now';
      return;
    }
    const d = Math.floor(ms / 86400000);
    const h = Math.floor((ms % 86400000) / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    el.textContent = `${d ? `${d}d ` : ''}${h}h ${m}m`;
  };
  update();
  setInterval(update, 60000);
};


const setFeaturedEpisode = async () => {
  const card = document.querySelector('[data-youtube-featured]');
  if (!card) return;

  try {
    const response = await fetch('data/latest-kipg-episode.json', { cache: 'no-store' });
    if (!response.ok) return;
    const episode = await response.json();
    if (!episode?.videoId) return;

    const thumbnail = card.querySelector('[data-youtube-thumbnail]');
    if (thumbnail && episode.thumbnail) {
      thumbnail.style.backgroundImage = `url("${episode.thumbnail}")`;
    }

    const title = document.querySelector('[data-featured-title]');
    if (title) title.textContent = episode.title || 'KIPG Podcast';

    const meta = document.querySelector('[data-featured-meta]');
    if (meta) meta.textContent = episode.episodeNumber
      ? `KIPG PODCAST • EPISODE ${episode.episodeNumber}`
      : 'KIPG PODCAST • LATEST COMPLETED EPISODE';

    const description = document.querySelector('[data-featured-description]');
    if (description && episode.description) description.textContent = episode.description;

    const watch = document.querySelector('[data-featured-watch]');
    if (watch && episode.watchUrl) {
      watch.href = episode.watchUrl;
      watch.target = '_blank';
      watch.rel = 'noopener';
    }

    if (Array.isArray(episode.recentEpisodes)) {
      document.querySelectorAll('[data-recent-episode]').forEach(cardEl => {
        const item = episode.recentEpisodes[Number(cardEl.dataset.recentEpisode)];
        if (!item) return;
        const art = cardEl.querySelector('.kipg-episode-card__art');
        const titleEl = cardEl.querySelector('.kipg-episode-card__art strong');
        const metaEl = cardEl.querySelector('.kipg-episode-card__meta');
        if (art && item.thumbnail) art.style.backgroundImage = `url("${item.thumbnail}")`;
        if (titleEl) titleEl.textContent = item.title || 'KIPG Podcast';
        if (metaEl) metaEl.textContent = item.episodeNumber
          ? `Episode ${item.episodeNumber} • KIPG Podcast`
          : 'KIPG Podcast';
        if (item.watchUrl) {
          cardEl.href = item.watchUrl;
          cardEl.target = '_blank';
          cardEl.rel = 'noopener';
        }
      });
    }

    const play = card.querySelector('.kipg-feature-play');
    if (play && episode.watchUrl) {
      play.addEventListener('click', () => window.open(episode.watchUrl, '_blank', 'noopener'));
    }
  } catch (error) {
    console.warn('KIPG featured episode data is not available yet.', error);
  }
};

const init = () => {
  setYear();
  setCountdown();
  setFeaturedEpisode();
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();
