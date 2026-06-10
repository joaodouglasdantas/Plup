/**
 * PLUP — TMDB Integration
 * Busca filmes, séries e animes na The Movie Database API
 *
 * Requer que TMDB_API_KEY esteja definida em firebase-config.js
 */

const TMDB = (() => {
  const BASE    = 'https://api.themoviedb.org/3';
  const IMG_SM  = 'https://image.tmdb.org/t/p/w342';
  const IMG_LG  = 'https://image.tmdb.org/t/p/w780';

  // ── Utilitário de fetch ───────────────────────
  async function _fetch(path, params = {}) {
    const key = (typeof TMDB_API_KEY !== 'undefined') ? TMDB_API_KEY : '';
    if (!key) throw new Error('TMDB_API_KEY não configurada. Consulte firebase-config.js.');
    const url = new URL(`${BASE}${path}`);
    url.searchParams.set('api_key', key);
    url.searchParams.set('language', 'pt-BR');
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`TMDB ${res.status}`);
    return res.json();
  }

  // ── Normalizar resultado ──────────────────────
  function _normalize(r) {
    const isMovie = r.media_type === 'movie';
    return {
      tmdbId:        r.id,
      tmdbType:      isMovie ? 'movie' : 'tv',
      title:         (isMovie ? r.title : r.name) || '',
      originalTitle: (isMovie ? r.original_title : r.original_name) || '',
      description:   r.overview || '',
      posterUrl:     r.poster_path ? `${IMG_SM}${r.poster_path}` : '',
      posterUrlLg:   r.poster_path ? `${IMG_LG}${r.poster_path}` : '',
      year:          ((isMovie ? r.release_date : r.first_air_date) || '').slice(0, 4),
      voteAverage:   r.vote_average || 0,
      genreIds:      r.genre_ids || (r.genres || []).map(g => g.id),
    };
  }

  // Género 16 = Animation; heurística simples para detectar anime
  function isLikelyAnime(item) {
    return (item.genreIds || []).includes(16);
  }

  // ── Busca multi (filmes + séries) ─────────────
  async function searchMulti(query) {
    if (!query.trim()) return [];
    const data = await _fetch('/search/multi', {
      query: query.trim(), page: 1, include_adult: false
    });
    return (data.results || [])
      .filter(r => r.media_type === 'movie' || r.media_type === 'tv')
      .slice(0, 8)
      .map(_normalize);
  }

  // ── Busca só filmes ───────────────────────────
  async function searchMovies(query) {
    if (!query.trim()) return [];
    const data = await _fetch('/search/movie', { query: query.trim(), page: 1 });
    return (data.results || []).slice(0, 8)
      .map(r => _normalize({ ...r, media_type: 'movie' }));
  }

  // ── Busca só séries/TV ────────────────────────
  async function searchTV(query) {
    if (!query.trim()) return [];
    const data = await _fetch('/search/tv', { query: query.trim(), page: 1 });
    return (data.results || []).slice(0, 8)
      .map(r => _normalize({ ...r, media_type: 'tv' }));
  }

  // ── Detalhes completos de série (com temporadas) ──
  async function getTvDetails(tmdbId) {
    const d = await _fetch(`/tv/${tmdbId}`);
    const seasons = (d.seasons || [])
      .filter(s => s.season_number > 0)
      .map(s => ({
        number:   s.season_number,
        name:     s.name || `Temporada ${s.season_number}`,
        episodes: s.episode_count || 0,
      }));
    const base = _normalize({ ...d, media_type: 'tv' });
    return {
      ...base,
      seasons,
      totalSeasons:   seasons.length,
      totalEpisodes:  d.number_of_episodes || null,
    };
  }

  return { searchMulti, searchMovies, searchTV, getTvDetails, isLikelyAnime };
})();
