/**
 * PLUP — App Principal
 * Roteamento, estado global, inicialização, UI
 */

// ════════════════════════════════════════════════
// ESTADO GLOBAL
// ════════════════════════════════════════════════
const AppState = {
  currentView:  'splash',
  prevView:     null,
  user:         null,
  userDoc:      null,
  coupleDoc:    null,
  categories:   [],
  ageRatings:   [],
  currentMovieId: null,

  // Unsubscribes dos listeners realtime
  _unsubs: []
};

// ════════════════════════════════════════════════
// NAVEGAÇÃO
// ════════════════════════════════════════════════
function navigateTo(viewName, data = {}) {
  AppState.prevView = AppState.currentView;
  AppState.currentView = viewName;

  // Views fora do main-layout (splash, auth, connect)
  const outerViews = ['splash', 'auth', 'connect'];
  const isOuter = outerViews.includes(viewName);

  // Esconder views externas
  document.querySelectorAll('#view-splash, #view-auth, #view-connect').forEach(v => v.classList.remove('active'));

  // Mostrar/ocultar main-layout
  const mainLayout = document.getElementById('main-layout');
  mainLayout.classList.toggle('hidden', isOuter);

  if (isOuter) {
    const target = document.getElementById(`view-${viewName}`);
    if (target) target.classList.add('active');
  } else {
    // Esconder todas as views dentro do main-content
    document.querySelectorAll('#main-content .view').forEach(v => v.classList.remove('active'));
    const target = document.getElementById(`view-${viewName}`);
    if (target) {
      target.classList.add('active');
      target.scrollTop = 0;
    }
  }

  // Atualizar nav (bottom + sidebar)
  updateNavState(viewName);

  // Hooks de entrada
  switch(viewName) {
    case 'feed':          initFeedView();     break;
    case 'movies':        initMoviesView();   break;
    case 'profile':
      if (data.coupleId)  initProfileView(data.coupleId, data.isOwn);
      else                initProfileView(AppState.coupleDoc?.id, true);
      break;
    case 'discover':      initDiscoverView(); break;
    case 'watchlist':     initWatchlistView(); break;
    case 'favorites':     initFavoritesView(); break;
    case 'settings':      initSettingsView(); break;
    case 'admin':         Admin.initAdmin();  break;
    case 'notifications': initNotifView();   break;
    case 'connect':       initConnectView();  break;
  }
}

function updateNavState(view) {
  // Bottom nav
  const nav = document.getElementById('bottom-nav');
  const outerViews = ['splash', 'auth', 'connect'];
  nav.classList.toggle('hidden', outerViews.includes(view));
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.nav === view);
  });
  // Sidebar
  document.querySelectorAll('.sidebar-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.nav === view);
  });
}

// updateBottomNav mantido por compatibilidade (updateNavState é o novo)
function updateBottomNav(view) { updateNavState(view); }

// ════════════════════════════════════════════════
// INICIALIZAÇÃO
// ════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  setupGlobalEventListeners();

  // Observer de autenticação
  Auth.onAuthChange(async (user, userDoc) => {
    AppState.user    = user;
    AppState.userDoc = userDoc;

    if (!user) {
      clearListeners();
      setTimeout(() => navigateTo('auth'), 1500); // splash → auth
    } else {
      AppState.userDoc = userDoc;

      // Mostrar botão admin na sidebar se for admin
      const adminBtn = document.getElementById('sidebar-admin-btn');
      if (adminBtn && Auth.isAdmin()) adminBtn.style.display = '';

      if (!userDoc?.coupleId) {
        if (Auth.isAdmin()) {
          setTimeout(() => navigateTo('feed'), 1500);
        } else {
          setTimeout(() => navigateTo('connect'), 1500);
        }
      } else {
        AppState.coupleDoc = await Couple.getCoupleDoc(userDoc.coupleId);
        setupRealtimeListeners();
        setTimeout(() => navigateTo('feed'), 1500);
      }
    }
  });

  // Carregar categorias e idades globalmente
  Movies.onCategories(cats => { AppState.categories = cats; });
  Movies.onAgeRatings(ages => { AppState.ageRatings = ages; });
});

function clearListeners() {
  AppState._unsubs.forEach(fn => fn?.());
  AppState._unsubs = [];
}

function setupRealtimeListeners() {
  clearListeners();
  const uid = AppState.user?.uid;
  const coupleId = AppState.userDoc?.coupleId;

  if (!uid || !coupleId) return;

  // Score/dados do casal em tempo real
  const unsubCouple = Couple.onCoupleDoc(coupleId, doc => {
    AppState.coupleDoc = doc;
    updateCoupleQuickCard(doc);
  });
  AppState._unsubs.push(unsubCouple);

  // Notificações
  const unsubNotif = Feed.onNotifications(uid, notifs => {
    const unread = notifs.filter(n => !n.read).length;
    const badge = document.getElementById('notif-badge');
    if (badge) {
      badge.textContent = unread;
      badge.classList.toggle('hidden', unread === 0);
    }
    AppState.notifications = notifs;
  });
  AppState._unsubs.push(unsubNotif);
}

// ════════════════════════════════════════════════
// EVENT LISTENERS GLOBAIS
// ════════════════════════════════════════════════
function setupGlobalEventListeners() {

  // ── Data-nav buttons ─────────────────────
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-nav]');
    if (btn) {
      const view = btn.dataset.nav;
      navigateTo(view);
    }
  });

  // ── AUTH TABS ─────────────────────────────
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`form-${tab.dataset.tab}`).classList.add('active');
      document.getElementById('auth-error').classList.add('hidden');
    });
  });

  // ── LOGIN ─────────────────────────────────
  document.getElementById('form-login').addEventListener('submit', async e => {
    e.preventDefault();
    const email    = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    try {
      showLoading(true);
      await Auth.login(email, password);
    } catch(err) {
      showAuthError(translateAuthError(err.code));
    } finally {
      showLoading(false);
    }
  });

  // ── CADASTRO ──────────────────────────────
  document.getElementById('form-register').addEventListener('submit', async e => {
    e.preventDefault();
    const name     = document.getElementById('reg-name').value;
    const nickname = document.getElementById('reg-nickname').value;
    const email    = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    try {
      showLoading(true);
      await Auth.register(name, nickname, email, password);
    } catch(err) {
      showAuthError(err.message || translateAuthError(err.code));
    } finally {
      showLoading(false);
    }
  });

  // ── RECUPERAR SENHA ───────────────────────
  document.getElementById('btn-forgot').addEventListener('click', async e => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    if (!email) { showAuthError('Digite seu e-mail primeiro'); return; }
    try {
      await Auth.resetPassword(email);
      showToast('E-mail de recuperação enviado!');
    } catch(err) {
      showAuthError(translateAuthError(err.code));
    }
  });

  // ── NOTIFICAÇÕES ──────────────────────────
  document.getElementById('btn-notifications').addEventListener('click', () => {
    navigateTo('notifications');
    if (AppState.user) Feed.markAllNotifsRead(AppState.user.uid);
  });

  // ── MODAL ─────────────────────────────────
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) closeModal();
  });

  // ── ADD MOVIE BACK ────────────────────────
  document.getElementById('add-movie-back').addEventListener('click', () => {
    navigateTo(AppState.prevView || 'movies');
  });
  document.getElementById('movie-back').addEventListener('click', () => {
    navigateTo(AppState.prevView || 'movies');
  });
}

// ════════════════════════════════════════════════
// VIEWS
// ════════════════════════════════════════════════

// ── FEED ──────────────────────────────────────
async function initFeedView() {
  const coupleId = AppState.coupleDoc?.id;
  if (!coupleId) return;

  updateCoupleQuickCard(AppState.coupleDoc);

  // Carregar feed
  showLoading(true);
  try {
    const events = await Feed.loadFeed(coupleId, 30);
    const container = document.getElementById('feed-list');

    if (!events.length) {
      container.innerHTML = `
        <div class="feed-empty">
          <img src="refs/personagem2.png" alt="" class="empty-mascot" />
          <p>Siga outros casais para ver o que estão assistindo!</p>
          <button class="btn btn-primary" data-nav="discover">
            <i class="fa-solid fa-compass"></i> Descobrir casais
          </button>
        </div>`;
      return;
    }

    container.innerHTML = '';
    for (const ev of events) {
      const coupleDoc = await Couple.getCoupleDoc(ev.coupleId);
      if (!coupleDoc) continue;
      const card = await Feed.renderFeedCard(ev, coupleDoc, AppState.categories);
      container.appendChild(card);
    }
  } catch(e) {
    console.error(e);
  } finally {
    showLoading(false);
  }
}

function updateCoupleQuickCard(doc) {
  if (!doc) return;
  const fill  = document.getElementById('score-fill');
  const score = document.getElementById('cqc-score-val');
  if (fill) fill.style.width = `${doc.scorePct || 0}%`;
  if (score) score.textContent = doc.score || 0;

  // Nomes
  Promise.all([
    Auth.fetchUserDoc(doc.user1),
    Auth.fetchUserDoc(doc.user2)
  ]).then(([u1, u2]) => {
    const el = document.getElementById('cqc-names');
    if (el) el.textContent = `${u1?.name || '?'} & ${u2?.name || '?'}`;

    const a1 = document.getElementById('cqc-avatar1');
    const a2 = document.getElementById('cqc-avatar2');
    if (a1) a1.innerHTML = u1?.avatarUrl ? `<img src="${u1.avatarUrl}" alt="">` : '<i class="fa-solid fa-user"></i>';
    if (a2) a2.innerHTML = u2?.avatarUrl ? `<img src="${u2.avatarUrl}" alt="">` : '<i class="fa-solid fa-user"></i>';
  });
}

// ── FILMES ─────────────────────────────────────
let _moviesUnsub = null;
let _moviesAll   = [];
let _currentCat  = 'all';

function initMoviesView() {
  renderCategoryChips();
  loadMoviesGrid('all');

  const searchInput = document.getElementById('movies-search');
  let searchTimeout;
  searchInput.value = '';
  searchInput.oninput = () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      const q = searchInput.value.trim();
      if (!q) {
        loadMoviesGrid(_currentCat);
      } else {
        Movies.searchMovies(q).then(results => renderMoviesGrid(results));
      }
    }, 400);
  };
}

function _renderIcon(icon) {
  if (!icon) return '';
  if (icon.startsWith('fa-')) return `<i class="fa-solid ${icon}"></i>`;
  return icon;
}

function renderCategoryChips() {
  const container = document.getElementById('category-chips');
  const cats = AppState.categories;
  const allChip = `<button class="chip ${_currentCat === 'all' ? 'active' : ''}" data-cat="all">Todos</button>`;
  const catChips = cats.map(c => {
    const dot = c.color ? `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${c.color};flex-shrink:0;"></span>` : '';
    return `<button class="chip ${_currentCat === c.id ? 'active' : ''}" data-cat="${c.id}">${dot}${_renderIcon(c.icon)} ${c.name}</button>`;
  }).join('');
  container.innerHTML = allChip + catChips;

  container.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      _currentCat = chip.dataset.cat;
      container.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      loadMoviesGrid(_currentCat);
    });
  });
}

function loadMoviesGrid(catId) {
  if (_moviesUnsub) { _moviesUnsub(); _moviesUnsub = null; }
  _moviesUnsub = Movies.onMovies(catId, movies => {
    _moviesAll = movies;
    renderMoviesGrid(movies);
  });
}

function renderMoviesGrid(movies) {
  const grid = document.getElementById('movies-grid');
  if (!movies.length) {
    grid.innerHTML = '<p class="empty-text" style="grid-column:1/-1">Nenhum filme encontrado</p>';
    return;
  }
  grid.innerHTML = movies.map(m => {
    const cat = AppState.categories.find(c => c.id === m.categoryId);
    const rating = ''; // simplificado
    return `
      <div class="movie-card" onclick="openMovieDetail('${m.id}')">
        ${m.coverUrl
          ? `<img class="movie-card-cover" src="${m.coverUrl}" alt="${m.title}" loading="lazy" />`
          : `<div class="movie-card-cover"></div>`}
        <div class="movie-card-info">
          <div class="movie-card-title">${m.title}</div>
          <div class="movie-card-cat">${cat ? `${cat.color ? `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${cat.color};vertical-align:middle;margin-right:2px;"></span>` : ''}${_renderIcon(cat.icon)} ${cat.name}` : ''}</div>
        </div>
      </div>
    `;
  }).join('');
}

// ── DETALHE DO FILME ───────────────────────────
async function openMovieDetail(movieId) {
  AppState.currentMovieId = movieId;
  navigateTo('movie-detail');

  showLoading(true);
  try {
    const movie = await Movies.getMovie(movieId);
    if (!movie) { showToast('Filme não encontrado'); navigateTo('movies'); return; }

    document.getElementById('movie-detail-title').textContent = movie.title;
    document.getElementById('movie-detail-desc').textContent  = movie.description;

    const coverEl = document.getElementById('movie-cover-large');
    coverEl.src = movie.coverUrl || '';
    coverEl.style.display = movie.coverUrl ? '' : 'none';

    const cat = AppState.categories.find(c => c.id === movie.categoryId);
    const age = AppState.ageRatings.find(a => a.id === movie.ageRatingId);
    const catEl = document.getElementById('movie-detail-cat');
    catEl.innerHTML = cat ? `${_renderIcon(cat.icon)} ${cat.name}` : '—';
    if (cat?.color) { catEl.style.background = cat.color; catEl.style.color = '#fff'; }
    else { catEl.style.background = ''; catEl.style.color = ''; }
    document.getElementById('movie-detail-age').textContent = age?.label || '';

    const coupleId = AppState.coupleDoc?.id;
    if (coupleId) {
      const [stars, inWatchlist, inFav, watched] = await Promise.all([
        Movies.getRating(coupleId, movieId),
        Movies.isInWatchlist(coupleId, movieId),
        Movies.isInFavorites(coupleId, movieId),
        Movies.isWatched(coupleId, movieId)
      ]);

      setupStarInput(stars);
      document.getElementById('btn-toggle-watchlist').classList.toggle('active', inWatchlist);
      document.getElementById('btn-toggle-favorite').classList.toggle('active', inFav);

      const watchedBtn = document.getElementById('btn-mark-watched');
      watchedBtn.innerHTML = watched ? '<i class="fa-solid fa-check"></i> Assistido!' : '<i class="fa-solid fa-check"></i> Marcar como assistido';
      watchedBtn.disabled = watched;
    }

    document.getElementById('movie-added-by').textContent =
      `Adicionado por ${movie.addedByName || 'alguém'}`;

    // Botões de ação
    document.getElementById('btn-rate-movie').onclick = async () => {
      const selected = document.querySelectorAll('#stars-input .star.active').length;
      if (!selected) { showToast('Selecione uma avaliação'); return; }
      if (!coupleId) { showToast('Conecte-se a um parceiro primeiro'); return; }
      try {
        showLoading(true);
        await Movies.rateMovie(coupleId, movieId, selected);
        showToast(`Avaliado com ${selected} estrelas`);
        document.getElementById('rating-display').textContent = `Sua avaliação: ${selected}/5 estrelas`;
      } catch(e) { showToast(e.message); }
      finally { showLoading(false); }
    };

    document.getElementById('btn-mark-watched').onclick = async () => {
      if (!coupleId) { showToast('Conecte-se a um parceiro primeiro'); return; }
      try {
        showLoading(true);
        await Movies.markWatched(coupleId, movieId);
        document.getElementById('btn-mark-watched').innerHTML = '<i class="fa-solid fa-check"></i> Assistido!';
        document.getElementById('btn-mark-watched').disabled = true;
        showToast('Marcado como assistido!');
      } catch(e) { showToast(e.message); }
      finally { showLoading(false); }
    };

    document.getElementById('btn-toggle-watchlist').onclick = async () => {
      if (!coupleId) return;
      const inList = await Movies.isInWatchlist(coupleId, movieId);
      if (inList) { await Movies.removeFromWatchlist(coupleId, movieId); showToast('Removido da watchlist'); }
      else { await Movies.addToWatchlist(coupleId, movieId); }
      document.getElementById('btn-toggle-watchlist').classList.toggle('active', !inList);
    };

    document.getElementById('btn-toggle-favorite').onclick = async () => {
      if (!coupleId) return;
      const added = await Movies.addToFavorites(coupleId, movieId);
      document.getElementById('btn-toggle-favorite').classList.toggle('active', added);
    };

    document.getElementById('btn-report-movie').onclick = () => {
      showModal('Denunciar filme', `
        <p style="margin-bottom:12px">Qual o motivo da denúncia?</p>
        <div class="input-group"><textarea id="report-reason" placeholder="Descreva o problema..." rows="3"></textarea></div>
      `, async () => {
        const reason = document.getElementById('report-reason')?.value || '';
        await Movies.reportMovie(movieId, reason, AppState.user.uid);
        closeModal();
      });
    };

  } catch(e) {
    console.error(e);
    showToast('Erro ao carregar filme');
  } finally {
    showLoading(false);
  }
}

function setupStarInput(currentVal) {
  const stars = document.querySelectorAll('#stars-input .star');
  const display = document.getElementById('rating-display');

  function highlightStars(val) {
    stars.forEach((s, i) => s.classList.toggle('active', i < val));
  }

  highlightStars(currentVal);
  if (currentVal) display.textContent = `Avaliação atual: ${currentVal}/5 estrelas`;

  stars.forEach((star, i) => {
    star.addEventListener('mouseenter', () => {
      stars.forEach((s, j) => s.classList.toggle('hover', j <= i));
    });
    star.addEventListener('mouseleave', () => {
      stars.forEach(s => s.classList.remove('hover'));
    });
    star.addEventListener('click', () => {
      stars.forEach(s => s.classList.remove('hover'));
      highlightStars(i + 1);
    });
  });
}

// ── ADICIONAR FILME ────────────────────────────
(function setupAddMovie() {
  const uploadArea   = document.getElementById('cover-upload-area');
  const fileInput    = document.getElementById('cover-file');
  const placeholder  = document.getElementById('cover-placeholder');
  const preview      = document.getElementById('cover-preview');
  let _coverFile     = null;

  uploadArea.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', e => {
    _coverFile = e.target.files[0];
    if (_coverFile) {
      const url = URL.createObjectURL(_coverFile);
      preview.src = url;
      preview.classList.remove('hidden');
      placeholder.style.display = 'none';
    }
  });

  // Preencher selects com categorias e idades
  Movies.onCategories(cats => {
    const sel = document.getElementById('movie-category');
    const current = sel.value;
    sel.innerHTML = '<option value="">Selecionar categoria</option>';
    cats.forEach(c => {
      sel.innerHTML += `<option value="${c.id}">${c.icon} ${c.name}</option>`;
    });
    sel.value = current;
  });

  Movies.onAgeRatings(ages => {
    const sel = document.getElementById('movie-age');
    const current = sel.value;
    sel.innerHTML = '<option value="">Classificação etária</option>';
    ages.forEach(a => {
      sel.innerHTML += `<option value="${a.id}">${a.label}</option>`;
    });
    sel.value = current;
  });

  document.getElementById('form-add-movie').addEventListener('submit', async e => {
    e.preventDefault();
    if (!AppState.user) { showToast('Faça login primeiro'); return; }

    const data = {
      title:       document.getElementById('movie-title').value,
      description: document.getElementById('movie-desc-input').value,
      categoryId:  document.getElementById('movie-category').value,
      ageRatingId: document.getElementById('movie-age').value
    };

    try {
      showLoading(true);
      await Movies.addMovie(data, _coverFile);
      showToast('Filme publicado!');
      document.getElementById('form-add-movie').reset();
      preview.classList.add('hidden');
      placeholder.style.display = '';
      _coverFile = null;
      navigateTo('movies');
    } catch(err) {
      showToast(err.message);
    } finally {
      showLoading(false);
    }
  });
})();

// ── WATCHLIST ──────────────────────────────────
async function initWatchlistView() {
  const coupleId = AppState.coupleDoc?.id;
  const container = document.getElementById('watchlist-container');
  if (!coupleId) { container.innerHTML = '<p class="empty-text">Conecte-se a um parceiro primeiro</p>'; return; }

  showLoading(true);
  try {
    const items = await Movies.getWatchlist(coupleId);
    if (!items.length) {
      container.innerHTML = `<div class="feed-empty"><img src="refs/personagem2.png" class="empty-mascot"/><p>Nenhum filme na watchlist ainda</p><button class="btn btn-primary" data-nav="movies">Explorar filmes</button></div>`;
      return;
    }
    container.innerHTML = '';
    for (const item of items) {
      const movie = await Movies.getMovie(item.movieId);
      if (!movie) continue;
      container.appendChild(buildListMovieItem(movie, () => removeFromWatchlistUI(coupleId, item.movieId, container)));
    }
  } finally { showLoading(false); }
}

async function removeFromWatchlistUI(coupleId, movieId, container) {
  await Movies.removeFromWatchlist(coupleId, movieId);
  showToast('Removido da watchlist');
  initWatchlistView();
}

// ── FAVORITOS ──────────────────────────────────
async function initFavoritesView() {
  const coupleId = AppState.coupleDoc?.id;
  const container = document.getElementById('favorites-container');
  if (!coupleId) { container.innerHTML = '<p class="empty-text">Conecte-se a um parceiro primeiro</p>'; return; }

  showLoading(true);
  try {
    const items = await Movies.getFavorites(coupleId);
    if (!items.length) {
      container.innerHTML = `<div class="feed-empty"><img src="refs/personagem2.png" class="empty-mascot"/><p>Nenhum favorito ainda</p><button class="btn btn-primary" data-nav="movies">Explorar filmes</button></div>`;
      return;
    }
    container.innerHTML = '';
    for (const item of items) {
      const movie = await Movies.getMovie(item.movieId);
      if (!movie) continue;
      container.appendChild(buildListMovieItem(movie, async () => {
        await Movies.addToFavorites(coupleId, item.movieId);
        initFavoritesView();
      }));
    }
  } finally { showLoading(false); }
}

function buildListMovieItem(movie, onRemove) {
  const cat = AppState.categories.find(c => c.id === movie.categoryId);
  const el = document.createElement('div');
  el.className = 'list-movie-item';
  el.innerHTML = `
    ${movie.coverUrl
      ? `<img class="list-movie-thumb" src="${movie.coverUrl}" alt="${movie.title}" loading="lazy" />`
      : `<div class="list-movie-thumb"></div>`}
    <div class="list-movie-info">
      <div class="list-movie-title">${movie.title}</div>
      <div class="list-movie-cat">${cat ? `${cat.color ? `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${cat.color};vertical-align:middle;margin-right:2px;"></span>` : ''}${_renderIcon(cat.icon)} ${cat.name}` : ''}</div>
    </div>
    <button class="list-movie-remove">🗑️</button>
  `;
  el.querySelector('.list-movie-info').addEventListener('click', () => openMovieDetail(movie.id));
  el.querySelector('.list-movie-remove').addEventListener('click', onRemove);
  return el;
}

// ── PERFIL ─────────────────────────────────────
async function initProfileView(coupleId, isOwn = true) {
  if (!coupleId) return;
  showLoading(true);
  try {
    const couple = await Couple.getCoupleDoc(coupleId);
    if (!couple) return;

    const [u1, u2] = await Promise.all([
      Auth.fetchUserDoc(couple.user1),
      Auth.fetchUserDoc(couple.user2)
    ]);

    document.getElementById('profile-couple-names').textContent = `${u1?.name || '?'} & ${u2?.name || '?'}`;

    const since = couple.createdAt?.toDate?.();
    document.getElementById('profile-couple-since').textContent = since
      ? `Casal desde ${since.toLocaleDateString('pt-BR', { month:'long', year:'numeric' })}`
      : 'Casal Plup';

    const a1 = document.getElementById('profile-avatar1');
    const a2 = document.getElementById('profile-avatar2');
    a1.innerHTML = u1?.avatarUrl ? `<img src="${u1.avatarUrl}" alt="">` : '<i class="fa-solid fa-user"></i>';
    a2.innerHTML = u2?.avatarUrl ? `<img src="${u2.avatarUrl}" alt="">` : '<i class="fa-solid fa-user"></i>';

    document.getElementById('profile-score-num').textContent = couple.score || 0;
    document.getElementById('stat-watched').textContent  = couple.moviesWatched || 0;
    document.getElementById('stat-favorites').textContent = couple.favoritesCount || 0;
    document.getElementById('stat-followers').textContent = couple.followersCount || 0;

    // Botão voltar (apenas quando perfil alheio)
    const backBtn = document.getElementById('profile-back-btn');
    backBtn.classList.toggle('hidden', isOwn);
    backBtn.onclick = () => navigateTo(AppState.prevView || 'feed');

    // Abas
    document.querySelectorAll('.profile-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.profile-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        loadProfileTab(coupleId, tab.dataset.ptab, isOwn);
      });
    });
    loadProfileTab(coupleId, 'watched', isOwn);

    // Ações
    const ownActions   = document.getElementById('profile-own-actions');
    const otherActions = document.getElementById('profile-other-actions');

    if (isOwn) {
      ownActions.classList.remove('hidden');
      otherActions.classList.add('hidden');

      document.getElementById('btn-disconnect-partner').onclick = () => {
        showModal('Desconectar parceiro', '<p>Tem certeza? Você perderá o perfil compartilhado.</p>', async () => {
          await Couple.disconnect(coupleId, couple.user1, couple.user2);
          AppState.coupleDoc = null;
          closeModal();
          navigateTo('connect');
        });
      };
      document.getElementById('btn-logout').onclick = async () => {
        await Auth.logout();
        navigateTo('auth');
      };
    } else {
      ownActions.classList.add('hidden');
      otherActions.classList.remove('hidden');

      const myCouple = AppState.coupleDoc?.id;
      const following = myCouple ? await Couple.isFollowing(myCouple, coupleId) : false;
      const followBtn = document.getElementById('btn-follow-couple');
      followBtn.textContent = following ? 'Deixar de seguir' : 'Seguir casal';
      followBtn.onclick = async () => {
        if (!myCouple) { showToast('Você precisa de um parceiro para seguir casais'); return; }
        if (following) await Couple.unfollowCouple(myCouple, coupleId);
        else await Couple.followCouple(myCouple, coupleId);
        initProfileView(coupleId, false);
      };

      document.getElementById('btn-report-couple').onclick = () => {
        showModal('Denunciar casal', `
          <div class="input-group"><textarea id="report-couple-reason" placeholder="Motivo da denúncia..." rows="3"></textarea></div>
        `, async () => {
          const reason = document.getElementById('report-couple-reason')?.value || '';
          await db.collection('reports').add({
            type: 'couple', targetId: coupleId, reason,
            reportedBy: AppState.user.uid, status: 'pending',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
          showToast('Denúncia enviada.');
          closeModal();
        });
      };
    }

  } finally { showLoading(false); }
}

async function loadProfileTab(coupleId, tab, isOwn = true) {
  const container = document.getElementById('profile-tab-content');
  container.innerHTML = '<p class="empty-text">Carregando...</p>';

  try {
    let items = [];
    if (tab === 'watched')   items = await Movies.getWatched(coupleId);
    if (tab === 'favorites') items = await Movies.getFavorites(coupleId);
    if (tab === 'watchlist') items = await Movies.getWatchlist(coupleId);

    if (!items.length) {
      container.innerHTML = '<p class="empty-text" style="grid-column:1/-1">Nenhum filme aqui ainda</p>';
      return;
    }

    container.innerHTML = '';
    for (const item of items) {
      const movie = await Movies.getMovie(item.movieId);
      if (!movie) continue;
      const img = document.createElement('img');
      img.className = 'profile-movie-thumb';
      img.src = movie.coverUrl || '';
      img.alt = movie.title;
      img.style.background = 'linear-gradient(135deg,var(--navy),var(--blue))';
      if (!movie.coverUrl) img.style.display = 'none';
      img.loading = 'lazy';
      img.addEventListener('click', () => openMovieDetail(movie.id, !isOwn));
      container.appendChild(img);
    }
  } catch(e) {
    console.error('loadProfileTab:', e);
    container.innerHTML = '<p class="empty-text" style="grid-column:1/-1">Erro ao carregar. Verifique os índices do Firestore no console.</p>';
  }
}

// ── DESCOBRIR ──────────────────────────────────
async function initDiscoverView() {
  const list = document.getElementById('discover-list');
  list.innerHTML = '<p class="empty-text">Carregando...</p>';

  const searchInput = document.getElementById('discover-search');
  searchInput.value = '';
  searchInput.oninput = _debounce(async () => {
    const q = searchInput.value.trim();
    if (q) {
      const results = await Couple.searchCoupleByNickname(q);
      renderCouplesList(results, list);
    } else {
      loadDiscoverCouples();
    }
  }, 500);

  loadDiscoverCouples();
}

async function loadDiscoverCouples() {
  const list = document.getElementById('discover-list');
  try {
    const couples = await Couple.listCouples(20);
    const myId = AppState.coupleDoc?.id;
    const filtered = couples.filter(c => c.id !== myId);
    renderCouplesList(filtered, list);
  } catch(e) {
    list.innerHTML = '<p class="empty-text">Erro ao carregar</p>';
  }
}

async function renderCouplesList(couples, container) {
  if (!couples.length) {
    container.innerHTML = '<p class="empty-text">Nenhum casal encontrado</p>';
    return;
  }
  container.innerHTML = '';
  for (const c of couples) {
    const [u1, u2] = await Promise.all([
      Auth.fetchUserDoc(c.user1),
      Auth.fetchUserDoc(c.user2)
    ]);
    const el = document.createElement('div');
    el.className = 'couple-item';
    el.innerHTML = `
      <div class="couple-item-avatars">
        <div class="avatar">${u1?.avatarUrl ? `<img src="${u1.avatarUrl}" alt="">` : '<i class="fa-solid fa-user"></i>'}</div>
        <div class="avatar">${u2?.avatarUrl ? `<img src="${u2.avatarUrl}" alt="">` : '<i class="fa-solid fa-user"></i>'}</div>
      </div>
      <div class="couple-item-info">
        <div class="couple-item-names">${u1?.name || '?'} & ${u2?.name || '?'}</div>
        <div class="couple-item-stats">@${u1?.nickname || ''} & @${u2?.nickname || ''} · ${c.moviesWatched || 0} filmes</div>
      </div>
      <div class="couple-item-score">${c.score || 0} pts</div>
    `;
    el.addEventListener('click', () => {
      const isOwn = c.id === AppState.coupleDoc?.id;
      navigateTo('profile', { coupleId: c.id, isOwn });
    });
    container.appendChild(el);
  }
}

// ── CONECTAR PARCEIRO ──────────────────────────
function initConnectView() {
  const uid = AppState.user?.uid;
  if (!uid) return;

  document.getElementById('my-user-id').textContent = uid;

  document.getElementById('btn-copy-id').onclick = () => {
    navigator.clipboard.writeText(uid).then(() => showToast('ID copiado!'));
  };

  document.getElementById('btn-search-partner').onclick = async () => {
    const q = document.getElementById('partner-search').value.trim();
    if (!q) return;

    showLoading(true);
    try {
      const found = await Couple.searchUser(q);
      const resultEl = document.getElementById('partner-result');
      const cardEl   = document.getElementById('partner-card');

      if (!found || found.uid === uid) {
        showToast(found ? 'Você não pode se adicionar 😅' : 'Usuário não encontrado');
        return;
      }
      if (found.coupleId) { showToast('Este usuário já está em um casal'); return; }

      cardEl.innerHTML = `
        <div class="avatar avatar-lg">${found.avatarUrl ? `<img src="${found.avatarUrl}" alt="">` : '<i class="fa-solid fa-user"></i>'}</div>
        <div>
          <div class="partner-name">${found.name}</div>
          <div class="partner-nick">@${found.nickname}</div>
        </div>
      `;
      resultEl.classList.remove('hidden');
      resultEl._foundUid = found.uid;
    } catch(e) { showToast(e.message); }
    finally { showLoading(false); }
  };

  document.getElementById('btn-send-invite').onclick = async () => {
    const toUid = document.getElementById('partner-result')._foundUid;
    if (!toUid) return;
    try {
      showLoading(true);
      await Couple.sendInvite(uid, toUid);
      document.getElementById('partner-result').classList.add('hidden');
      document.getElementById('connect-pending').classList.remove('hidden');
      showToast('Convite enviado!');
    } catch(e) { showToast(e.message); }
    finally { showLoading(false); }
  };

  document.getElementById('btn-cancel-invite').onclick = async () => {
    try {
      await Couple.cancelInvite(uid);
      document.getElementById('connect-pending').classList.add('hidden');
      showToast('Convite cancelado');
    } catch(e) { showToast(e.message); }
  };

  // Verificar convite pendente enviado
  Couple.checkPendingInvite(uid).then(inv => {
    if (inv) document.getElementById('connect-pending').classList.remove('hidden');
  });

  // Convites recebidos
  Couple.onInvitesReceived(uid, invites => {
    const list = document.getElementById('invites-list');
    if (!invites.length) { list.innerHTML = '<p style="font-size:.8rem;color:var(--gray-4)">Nenhum convite recebido</p>'; return; }
    list.innerHTML = invites.map(inv => `
      <div class="invite-item" data-id="${inv.id}">
        <div class="avatar">${inv.fromAvatar ? `<img src="${inv.fromAvatar}" alt="">` : '<i class="fa-solid fa-user"></i>'}</div>
        <div class="invite-info">
          <div class="invite-name">${inv.fromName}</div>
          <div class="invite-nick">@${inv.fromNickname}</div>
        </div>
        <div class="invite-actions">
          <button class="btn btn-success btn-sm btn-accept-invite" data-id="${inv.id}" data-from="${inv.from}" data-name="${inv.fromName}" data-nick="${inv.fromNickname}" data-avatar="${inv.fromAvatar || ''}"><i class="fa-solid fa-check"></i></button>
          <button class="btn btn-ghost btn-sm btn-decline-invite" data-id="${inv.id}">✕</button>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.btn-accept-invite').forEach(btn => {
      btn.onclick = async () => {
        try {
          showLoading(true);
          const inv = { from: btn.dataset.from, fromName: btn.dataset.name, fromNickname: btn.dataset.nick, fromAvatar: btn.dataset.avatar };
          const coupleId = await Couple.acceptInvite(btn.dataset.id, inv);
          AppState.coupleDoc = await Couple.getCoupleDoc(coupleId);
          AppState.userDoc = await Auth.fetchUserDoc(uid);
          setupRealtimeListeners();
          showToast('Vocês agora são um casal!');
          navigateTo('feed');
        } catch(e) { showToast(e.message); }
        finally { showLoading(false); }
      };
    });

    list.querySelectorAll('.btn-decline-invite').forEach(btn => {
      btn.onclick = async () => {
        await Couple.declineInvite(btn.dataset.id);
        showToast('Convite recusado');
      };
    });
  });
}

// ── NOTIFICAÇÕES ──────────────────────────────
function initNotifView() {
  const list = document.getElementById('notifications-list');
  const notifs = AppState.notifications || [];

  if (!notifs.length) {
    list.innerHTML = '<p class="empty-text">Nenhuma notificação ainda</p>';
    return;
  }

  list.innerHTML = notifs.map(n => `
    <div class="notif-item ${n.read ? '' : 'unread'}">
      <span class="notif-icon">${_notifIcon(n.type)}</span>
      <div>
        <div class="notif-text">${n.message}</div>
        <div class="notif-time">${_timeAgoFromTs(n.createdAt)}</div>
      </div>
    </div>
  `).join('');
}

function _notifIcon(type) {
  const icons = {
    invite_accepted: '<i class="fa-solid fa-heart"></i>',
    new_follower:    '<i class="fa-solid fa-users"></i>',
    default:         '<i class="fa-solid fa-bell"></i>'
  };
  return icons[type] || icons.default;
}

function _timeAgoFromTs(ts) {
  if (!ts) return '';
  const d = ts.toDate?.() || new Date(ts);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60)    return 'agora mesmo';
  if (diff < 3600)  return `${Math.floor(diff/60)} min`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h`;
  return `${Math.floor(diff/86400)}d`;
}

// ── CONFIGURAÇÕES ──────────────────────────────
function initSettingsView() {
  const user = AppState.user;
  const doc  = AppState.userDoc;
  if (!user || !doc) return;

  document.getElementById('settings-name').value     = doc.name || '';
  document.getElementById('settings-nickname').value = `@${doc.nickname || ''}`;

  const avatarEl = document.getElementById('settings-avatar');
  avatarEl.innerHTML = doc.avatarUrl ? `<img src="${doc.avatarUrl}" alt="">` : '<i class="fa-solid fa-user"></i>';

  document.getElementById('btn-change-avatar').onclick = () => {
    document.getElementById('avatar-file').click();
  };

  document.getElementById('avatar-file').onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    showLoading(true);
    try {
      const url = await Auth.uploadAvatar(user.uid, file);
      avatarEl.innerHTML = `<img src="${url}" alt="">`;
      AppState.userDoc = await Auth.fetchUserDoc(user.uid);
      showToast('Foto atualizada!');
    } catch(e) { showToast(e.message); }
    finally { showLoading(false); }
  };

  document.getElementById('btn-save-settings').onclick = async () => {
    const name = document.getElementById('settings-name').value.trim();
    if (!name) { showToast('Digite seu nome'); return; }
    showLoading(true);
    try {
      await Auth.updateProfile(user.uid, { name });
      AppState.userDoc = await Auth.fetchUserDoc(user.uid);
      showToast('Perfil atualizado!');
    } catch(e) { showToast(e.message); }
    finally { showLoading(false); }
  };

  document.getElementById('btn-settings-logout').onclick = async () => {
    await Auth.logout();
    navigateTo('auth');
  };
}

// ════════════════════════════════════════════════
// MODAL
// ════════════════════════════════════════════════
function showModal(title, bodyHtml, onConfirm) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.getElementById('modal-confirm').onclick = onConfirm;
}
function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

// ════════════════════════════════════════════════
// TOAST
// ════════════════════════════════════════════════
let _toastTimeout;
function showToast(msg) {
  const toast = document.getElementById('toast');
  document.getElementById('toast-msg').textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(_toastTimeout);
  _toastTimeout = setTimeout(() => toast.classList.add('hidden'), 3000);
}

// ════════════════════════════════════════════════
// LOADING
// ════════════════════════════════════════════════
function showLoading(show) {
  document.getElementById('loading-overlay').classList.toggle('hidden', !show);
}

// ════════════════════════════════════════════════
// AUTH HELPERS
// ════════════════════════════════════════════════
function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function translateAuthError(code) {
  const map = {
    'auth/user-not-found':    'E-mail não cadastrado',
    'auth/wrong-password':    'Senha incorreta',
    'auth/email-already-in-use': 'Este e-mail já está em uso',
    'auth/weak-password':     'Senha muito fraca (mínimo 6 caracteres)',
    'auth/invalid-email':     'E-mail inválido',
    'auth/too-many-requests': 'Muitas tentativas. Tente mais tarde.',
    'auth/network-request-failed': 'Sem conexão com a internet'
  };
  return map[code] || 'Erro desconhecido. Tente novamente.';
}

// ════════════════════════════════════════════════
// UTILS
// ════════════════════════════════════════════════
function _debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// Expor para o feed
window._app = { openMovieDetail };
