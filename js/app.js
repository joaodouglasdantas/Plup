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
  editingMovieId: null,
  _watchlistUnsub: null,
  _favoritesUnsub: null,

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

  // add-movie-back é gerenciado dentro de setupAddMovie (suporta modo edição)
  document.getElementById('movie-back').addEventListener('click', () => {
    navigateTo(AppState.prevView || 'movies');
  });

  // ── LOGOUT & DESCONECTAR (independentes do estado do perfil) ─
  document.getElementById('btn-logout').addEventListener('click', async () => {
    await Auth.logout();
    navigateTo('auth');
  });

  document.getElementById('btn-disconnect-partner').addEventListener('click', () => {
    const coupleDoc = AppState.coupleDoc;
    if (!coupleDoc) { showToast('Nenhum casal vinculado'); return; }
    showModal('Desconectar parceiro', '<p>Tem certeza? Você perderá o perfil compartilhado.</p>', async () => {
      await Couple.disconnect(coupleDoc.id, coupleDoc.user1, coupleDoc.user2);
      AppState.coupleDoc = null;
      closeModal();
      navigateTo('connect');
    });
  });
}

// ════════════════════════════════════════════════
// VIEWS
// ════════════════════════════════════════════════

// ── FEED ──────────────────────────────────────
let _feedRenderGen = 0;

async function initFeedView() {
  const coupleId = AppState.coupleDoc?.id;
  const isAdmin  = Auth.isAdmin();

  if (!coupleId && !isAdmin) return;

  if (coupleId) updateCoupleQuickCard(AppState.coupleDoc);

  if (AppState._feedUnsub) { AppState._feedUnsub(); AppState._feedUnsub = null; }

  showLoading(true);
  let firstEmit = true;

  try {
    const onEvents = async (events) => {
      const gen = ++_feedRenderGen;
      if (firstEmit) { showLoading(false); firstEmit = false; }

      const container = document.getElementById('feed-list');
      if (!events.length) {
        container.innerHTML = `
          <div class="feed-empty">
            <img src="refs/personagem.png" alt="" class="empty-mascot" />
            <p>Siga outros casais para ver o que estão assistindo!</p>
            <button class="btn btn-primary" data-nav="discover">
              <i class="fa-solid fa-compass"></i> Descobrir casais
            </button>
          </div>`;
        return;
      }

      container.innerHTML = '';
      for (const ev of events) {
        const evCouple = await Couple.getCoupleDoc(ev.coupleId);
        if (gen !== _feedRenderGen) return;
        if (!evCouple) continue;

        if (ev.movieId) {
          const movie = await Movies.getMovie(ev.movieId);
          if (gen !== _feedRenderGen) return;
          if (!movie) {
            db.collection('feed').doc(ev.id).delete().catch(() => {});
            continue;
          }
        }

        const card = await Feed.renderFeedCard(ev, evCouple, AppState.categories);
        if (gen !== _feedRenderGen) return;
        container.appendChild(card);
      }
    };

    if (isAdmin && !coupleId) {
      AppState._feedUnsub = Feed.onAdminFeed(onEvents);
    } else {
      const followingIds = await Couple.getFollowing(coupleId);
      AppState._feedUnsub = Feed.onFeed([coupleId, ...followingIds], onEvents);
    }
  } catch(e) {
    console.error(e);
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
    if (a1) a1.innerHTML = _avatarImg(u1);
    if (a2) a2.innerHTML = _avatarImg(u2);
  });
}

// ── FILMES ─────────────────────────────────────
let _moviesUnsub = null;
let _moviesAll   = [];
let _currentCat  = 'all';

function initMoviesView() {
  _currentCat = 'all';
  renderCategoryChips();
  loadMoviesGrid('all'); // listener persiste entre visitas — só refiltra se já ativo

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
    return `<button class="chip ${_currentCat === c.id ? 'active' : ''}" data-cat="${c.id}">${dot} ${c.name}</button>`;
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
  _currentCat = catId;
  if (_moviesUnsub) {
    // Listener já ativo — só refiltra client-side
    const filtered = catId === 'all' ? _moviesAll : _moviesAll.filter(m => {
      const ids = m.categoryIds || (m.categoryId ? [m.categoryId] : []);
      return ids.includes(catId);
    });
    renderMoviesGrid(filtered);
  } else {
    // Primeiro acesso — abre listener para TODOS os filmes
    _moviesUnsub = Movies.onMovies(movies => {
      _moviesAll = movies;
      const filtered = _currentCat === 'all' ? movies : movies.filter(m => {
        const ids = m.categoryIds || (m.categoryId ? [m.categoryId] : []);
        return ids.includes(_currentCat);
      });
      renderMoviesGrid(filtered);
    });
  }
}

function renderMoviesGrid(movies) {
  const grid = document.getElementById('movies-grid');
  if (!movies.length) {
    grid.innerHTML = '<p class="empty-text" style="grid-column:1/-1">Nenhum filme encontrado</p>';
    return;
  }
  grid.innerHTML = movies.map(m => {
    const ids = m.categoryIds || (m.categoryId ? [m.categoryId] : []);
    const catBadges = AppState.categories
      .filter(c => ids.includes(c.id))
      .map(c => `<span class="badge-cat-card" ${c.color ? `style="background:${c.color};color:#fff"` : ''}>${c.name}</span>`)
      .join('');
    return `
      <div class="movie-card" onclick="openMovieDetail('${m.id}')">
        ${m.coverUrl
          ? `<img class="movie-card-cover" src="${m.coverUrl}" alt="${m.title}" loading="lazy" style="object-position:${m.coverPosition||'50% 50%'}" />`
          : `<div class="movie-card-cover"></div>`}
        <div class="movie-card-info">
          <div class="movie-card-title">${m.title}</div>
          <div class="movie-card-cat" style="display:flex;flex-wrap:wrap;gap:4px">${catBadges}</div>
        </div>
      </div>
    `;
  }).join('');
}

// ── DETALHE DO FILME ───────────────────────────
async function openMovieDetail(movieId, readOnly = false, skipNav = false) {
  AppState.currentMovieId = movieId;
  if (!skipNav) navigateTo('movie-detail');

  // Mostrar/ocultar ações conforme contexto
  document.querySelector('.movie-detail-actions').style.display = readOnly ? 'none' : '';
  document.querySelector('.rating-section').style.display       = readOnly ? 'none' : '';

  showLoading(true);
  try {
    const movie = await Movies.getMovie(movieId);
    if (!movie) { showToast('Filme não encontrado'); navigateTo('movies'); return; }

    document.getElementById('movie-detail-title').textContent = movie.title;
    document.getElementById('movie-detail-desc').textContent  = movie.description;

    // Botão editar — visível apenas para o casal que adicionou o filme
    const editBtn = document.getElementById('btn-edit-movie');
    const canEdit = !readOnly && movie.addedByCoupleId === AppState.coupleDoc?.id;
    editBtn.classList.toggle('hidden', !canEdit);
    editBtn.onclick = canEdit ? () => openEditMovie(movie) : null;

    const coverEl = document.getElementById('movie-cover-large');
    coverEl.src = movie.coverUrl || '';
    coverEl.style.objectPosition = movie.coverPosition || '50% 50%';
    coverEl.style.display = movie.coverUrl ? '' : 'none';

    const age = AppState.ageRatings.find(a => a.id === movie.ageRatingId);
    const catEl = document.getElementById('movie-detail-cat');
    const catIds = movie.categoryIds || (movie.categoryId ? [movie.categoryId] : []);
    const matchedCats = AppState.categories.filter(c => catIds.includes(c.id));
    catEl.innerHTML = matchedCats.length
      ? matchedCats.map(c => `<span class="badge-cat" ${c.color ? `style="background:${c.color};color:#fff"` : ''}>${c.name}</span>`).join('')
      : '—';
    const ageEl = document.getElementById('movie-detail-age');
    ageEl.textContent = age?.label || '';
    ageEl.style.background = age?.color || '';
    ageEl.style.color = age?.color ? '#fff' : '';
    ageEl.style.display = age?.label ? '' : 'none';

    const coupleId  = AppState.coupleDoc?.id;
    const myUid     = AppState.user?.uid;
    const coupleDoc = AppState.coupleDoc;
    const partnerUid = coupleDoc
      ? (coupleDoc.user1 === myUid ? coupleDoc.user2 : coupleDoc.user1)
      : null;

    if (coupleId && !readOnly) {
      const [myStars, partnerStars, inWatchlist, inFav, watched] = await Promise.all([
        Movies.getRating(coupleId, movieId),
        partnerUid ? Movies.getPartnerRating(coupleId, movieId, partnerUid) : Promise.resolve(null),
        Movies.isInWatchlist(coupleId, movieId),
        Movies.isInFavorites(coupleId, movieId),
        Movies.isWatched(coupleId, movieId)
      ]);

      setupStarInput(myStars);
      document.getElementById('btn-toggle-watchlist').classList.toggle('active', inWatchlist);
      document.getElementById('btn-toggle-favorite').classList.toggle('active', inFav);

      // Exibir notas individuais e média
      _updateCoupleRatingsInfo(myStars, partnerStars);

      // Botão assistido — toggle marcar/remover
      _updateWatchedBtn(watched);

      // Regra de negócio: só pode avaliar se já assistiu
      const starsInput    = document.getElementById('stars-input');
      const rateBtn       = document.getElementById('btn-rate-movie');
      const ratingDisplay = document.getElementById('rating-display');
      if (!watched) {
        starsInput.style.pointerEvents = 'none';
        starsInput.style.opacity = '0.35';
        rateBtn.disabled = true;
        ratingDisplay.textContent = 'Marque como assistido para avaliar';
      }
    }

    // "Adicionado pelo casal X & Y" clicável
    const addedByEl = document.getElementById('movie-added-by');
    if (movie.addedByCoupleId) {
      addedByEl.innerHTML = 'Adicionado pelo casal <span class="couple-link" style="cursor:pointer;color:var(--blue);font-weight:700;text-decoration:underline">carregando...</span>';
      const coupleDoc = await Couple.getCoupleDoc(movie.addedByCoupleId);
      if (coupleDoc) {
        const [u1, u2] = await Promise.all([Auth.fetchUserDoc(coupleDoc.user1), Auth.fetchUserDoc(coupleDoc.user2)]);
        const coupleName = `${u1?.name || '?'} & ${u2?.name || '?'}`;
        const link = addedByEl.querySelector('.couple-link');
        link.textContent = coupleName;
        link.onclick = () => {
          const isOwn = movie.addedByCoupleId === AppState.coupleDoc?.id;
          navigateTo('profile', { coupleId: movie.addedByCoupleId, isOwn });
        };
      } else {
        addedByEl.textContent = `Adicionado por ${movie.addedByName || 'alguém'}`;
      }
    } else {
      addedByEl.textContent = `Adicionado por ${movie.addedByName || 'alguém'}`;
    }

    // Botões de ação
    document.getElementById('btn-rate-movie').onclick = async () => {
      const selected = parseFloat(document.getElementById('stars-input').dataset.selectedRating || '0');
      if (!selected) { showToast('Selecione uma avaliação'); return; }
      if (!coupleId) { showToast('Conecte-se a um parceiro primeiro'); return; }
      try {
        showLoading(true);
        await Movies.rateMovie(coupleId, movieId, selected);
        showToast(`Avaliado com ${selected} ⭐`);
        document.getElementById('rating-display').textContent = `Sua nota: ${selected} de 5`;
        // Atualizar info do casal com nova nota
        const partnerStars2 = partnerUid ? await Movies.getPartnerRating(coupleId, movieId, partnerUid) : null;
        _updateCoupleRatingsInfo(selected, partnerStars2);
      } catch(e) { showToast(e.message); }
      finally { showLoading(false); }
    };

    document.getElementById('btn-mark-watched').onclick = async () => {
      if (!coupleId) { showToast('Conecte-se a um parceiro primeiro'); return; }
      const currentlyWatched = document.getElementById('btn-mark-watched').dataset.watched === '1';
      try {
        showLoading(true);
        if (currentlyWatched) {
          await Movies.removeFromWatched(coupleId, movieId);
          showToast('Removido dos assistidos');
          _updateWatchedBtn(false);
          // Bloquear avaliação novamente
          const si = document.getElementById('stars-input');
          si.style.pointerEvents = 'none';
          si.style.opacity = '0.35';
          document.getElementById('btn-rate-movie').disabled = true;
          document.getElementById('rating-display').textContent = 'Marque como assistido para avaliar';
        } else {
          await Movies.markWatched(coupleId, movieId);
          showToast('Marcado como assistido!');
          _updateWatchedBtn(true);
          // Desbloquear avaliação
          const si = document.getElementById('stars-input');
          si.style.pointerEvents = '';
          si.style.opacity = '';
          document.getElementById('btn-rate-movie').disabled = false;
          document.getElementById('rating-display').textContent = 'Sem avaliação ainda';
        }
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

function _updateWatchedBtn(watched) {
  const btn = document.getElementById('btn-mark-watched');
  if (!btn) return;
  btn.dataset.watched = watched ? '1' : '0';
  if (watched) {
    btn.className = 'btn btn-ghost btn-sm';
    btn.innerHTML = '<i class="fa-solid fa-eye-slash"></i> Remover dos assistidos';
  } else {
    btn.className = 'btn btn-success';
    btn.innerHTML = '<i class="fa-solid fa-check"></i> Marcar como assistido';
  }
}

function _updateCoupleRatingsInfo(myStars, partnerStars) {
  const el = document.getElementById('couple-ratings-info');
  if (!el) return;
  if (!myStars && partnerStars === null) { el.textContent = ''; return; }
  const myText      = myStars      ? `Você: ${myStars}★` : 'Você: ainda não avaliou';
  const partnerText = partnerStars !== null ? `Parceiro(a): ${partnerStars}★` : 'Parceiro(a): ainda não avaliou';
  const avg = (myStars && partnerStars !== null)
    ? `Média do casal: ${((myStars + partnerStars) / 2).toFixed(1)}★`
    : '';
  el.innerHTML = [myText, partnerText, avg].filter(Boolean).join(' &nbsp;|&nbsp; ');
}

function setupStarInput(currentVal) {
  const container = document.getElementById('stars-input');
  const display   = document.getElementById('rating-display');
  let selectedVal = currentVal || 0;

  function renderStars(val) {
    container.querySelectorAll('.star-icon').forEach((icon, i) => {
      const n = i + 1;
      if (val >= n)            icon.className = 'fa-solid fa-star star-icon star-active';
      else if (val >= n - 0.5) icon.className = 'fa-solid fa-star-half-stroke star-icon star-active';
      else                     icon.className = 'fa-solid fa-star star-icon';
    });
  }

  container.innerHTML = '';
  for (let n = 1; n <= 5; n++) {
    const wrapper = document.createElement('span');
    wrapper.className = 'star-wrapper';

    const icon = document.createElement('i');
    icon.className = 'fa-solid fa-star star-icon';

    // Dois triggers invisíveis: metade esquerda = X.5, metade direita = X.0
    const left  = document.createElement('span');
    const right = document.createElement('span');
    left.className  = 'star-half-l';
    right.className = 'star-half-r';

    const hoverLeft  = () => { renderStars(n - 0.5); display.textContent = `${n - 0.5} de 5 ⭐`; };
    const hoverRight = () => { renderStars(n);       display.textContent = `${n} de 5 ⭐`; };

    left.addEventListener('mouseenter',  hoverLeft);
    right.addEventListener('mouseenter', hoverRight);

    left.addEventListener('click', () => {
      selectedVal = n - 0.5;
      container.dataset.selectedRating = selectedVal;
      renderStars(selectedVal);
      display.textContent = `${selectedVal} de 5 ⭐ selecionado`;
    });
    right.addEventListener('click', () => {
      selectedVal = n;
      container.dataset.selectedRating = selectedVal;
      renderStars(selectedVal);
      display.textContent = `${selectedVal} de 5 ⭐ selecionado`;
    });

    wrapper.appendChild(icon);
    wrapper.appendChild(left);
    wrapper.appendChild(right);
    container.appendChild(wrapper);
  }

  container.onmouseleave = () => {
    renderStars(selectedVal);
    display.textContent = selectedVal
      ? `Avaliação atual: ${selectedVal} de 5 estrelas`
      : 'Sem avaliação ainda';
  };

  container.dataset.selectedRating = selectedVal;
  renderStars(selectedVal);
  if (currentVal) display.textContent = `Avaliação atual: ${currentVal} de 5 estrelas`;
}

// ── ADICIONAR / EDITAR CONTEÚDO ───────────────
let _prefillEditForm = null;
let _resetAddMovieForm = null;

(function setupAddMovie() {
  const uploadArea  = document.getElementById('cover-upload-area');
  const fileInput   = document.getElementById('cover-file');
  const placeholder = document.getElementById('cover-placeholder');
  const preview     = document.getElementById('cover-preview');
  const hint        = document.getElementById('cover-reposition-hint');
  const titleH2     = document.getElementById('add-movie-title');
  const submitBtn   = document.getElementById('add-movie-submit');
  let _coverFile    = null;
  let _coverUrlFromTmdb = null; // URL da capa vinda do TMDB (não é um File)
  let _coverPos     = '50% 50%';
  let _dragging     = false;
  let _didDrag      = false;
  let _dragStart    = { x: 0, y: 0 };
  let _posStart     = { x: 50, y: 50 };

  // ── Estado do conteúdo ─────────────────────
  let _contentType  = 'movie'; // 'movie' | 'series' | 'anime'
  let _tmdbData     = null;    // objeto normalizado do TMDB selecionado
  let _seasons      = [];      // [{number, name, episodes}]

  // ── Capa ───────────────────────────────────
  function _showCover(src, pos) {
    preview.src = src;
    _coverPos = pos || '50% 50%';
    preview.style.objectPosition = _coverPos;
    preview.classList.remove('hidden');
    preview.classList.add('draggable');
    placeholder.style.display = 'none';
    hint.classList.remove('hidden');
  }

  function _hideCover() {
    preview.src = '';
    preview.classList.add('hidden');
    preview.classList.remove('draggable', 'dragging');
    placeholder.style.display = '';
    hint.classList.add('hidden');
    _coverPos = '50% 50%';
    _coverUrlFromTmdb = null;
  }

  // Drag para reposicionar (mouse)
  preview.addEventListener('mousedown', e => {
    if (preview.classList.contains('hidden')) return;
    e.preventDefault();
    _dragging = true;
    _didDrag  = false;
    _dragStart = { x: e.clientX, y: e.clientY };
    const p = _coverPos.split(' ');
    _posStart = { x: parseFloat(p[0]), y: parseFloat(p[1]) };
    preview.classList.add('dragging');
  });
  document.addEventListener('mousemove', e => {
    if (!_dragging) return;
    const dx = Math.abs(e.clientX - _dragStart.x);
    const dy = Math.abs(e.clientY - _dragStart.y);
    if (dx > 3 || dy > 3) _didDrag = true;
    const rect = preview.getBoundingClientRect();
    const nx = Math.max(0, Math.min(100, _posStart.x - (e.clientX - _dragStart.x) / rect.width * 100));
    const ny = Math.max(0, Math.min(100, _posStart.y - (e.clientY - _dragStart.y) / rect.height * 100));
    _coverPos = `${nx.toFixed(1)}% ${ny.toFixed(1)}%`;
    preview.style.objectPosition = _coverPos;
  });
  document.addEventListener('mouseup', () => {
    if (_dragging) { _dragging = false; preview.classList.remove('dragging'); }
  });

  // Drag (touch)
  preview.addEventListener('touchstart', e => {
    if (preview.classList.contains('hidden')) return;
    _dragging = true;
    _didDrag  = false;
    const t = e.touches[0];
    _dragStart = { x: t.clientX, y: t.clientY };
    const p = _coverPos.split(' ');
    _posStart = { x: parseFloat(p[0]), y: parseFloat(p[1]) };
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    if (!_dragging) return;
    const t = e.touches[0];
    const dx = Math.abs(t.clientX - _dragStart.x);
    const dy = Math.abs(t.clientY - _dragStart.y);
    if (dx > 3 || dy > 3) _didDrag = true;
    const rect = preview.getBoundingClientRect();
    const nx = Math.max(0, Math.min(100, _posStart.x - (t.clientX - _dragStart.x) / rect.width * 100));
    const ny = Math.max(0, Math.min(100, _posStart.y - (t.clientY - _dragStart.y) / rect.height * 100));
    _coverPos = `${nx.toFixed(1)}% ${ny.toFixed(1)}%`;
    preview.style.objectPosition = _coverPos;
  });
  document.addEventListener('touchend', () => { _dragging = false; });

  // Clique abre seletor — na área inteira, mas ignora se foi um arraste
  uploadArea.addEventListener('click', () => {
    if (_didDrag) { _didDrag = false; return; }
    fileInput.click();
  });

  fileInput.addEventListener('change', e => {
    _coverFile = e.target.files[0];
    _coverUrlFromTmdb = null;
    if (_coverFile) _showCover(URL.createObjectURL(_coverFile), '50% 50%');
  });

  const deleteBtn = document.getElementById('btn-delete-movie');

  // ── Tabs de tipo de conteúdo ───────────────
  const typeTabs = document.getElementById('content-type-tabs');
  typeTabs.addEventListener('click', e => {
    const tab = e.target.closest('.content-type-tab');
    if (!tab) return;
    _setContentType(tab.dataset.ctype);
  });

  function _setContentType(type, lock = false) {
    _contentType = type;
    // Atualizar tabs visualmente
    typeTabs.querySelectorAll('.content-type-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.ctype === type);
    });
    // Mostrar/ocultar campos extras
    document.getElementById('series-fields').classList.toggle('hidden', type !== 'series');
    document.getElementById('anime-fields').classList.toggle('hidden', type !== 'anime');
    // Bloquear tabs se veio do TMDB (optional UX)
    typeTabs.querySelectorAll('.content-type-tab').forEach(t => {
      t.disabled = lock;
      t.style.opacity = lock ? '.5' : '';
    });
    // Limpar seasons quando muda de tipo
    if (!lock) {
      _seasons = [];
      document.getElementById('seasons-detail-list').innerHTML = '';
      document.getElementById('anime-seasons-detail-list').innerHTML = '';
      document.getElementById('series-seasons-count').value = '';
      document.getElementById('anime-seasons-count').value  = '';
      document.getElementById('anime-total-eps').value      = '';
    }
  }
  // Inicializar com movie
  _setContentType('movie');

  // ── Configurar temporadas (série) ──────────
  document.getElementById('btn-apply-seasons').addEventListener('click', () => {
    const n = parseInt(document.getElementById('series-seasons-count').value, 10);
    if (!n || n < 1) { showToast('Informe o número de temporadas'); return; }
    _buildSeasonRows('seasons-detail-list', n, _seasons);
  });

  document.getElementById('btn-apply-anime-seasons').addEventListener('click', () => {
    const n = parseInt(document.getElementById('anime-seasons-count').value, 10);
    if (!n || n < 1) { showToast('Informe o número de temporadas'); return; }
    _buildSeasonRows('anime-seasons-detail-list', n, _seasons);
  });

  // Toggle sequencial / por temporada (anime)
  document.querySelectorAll('input[name="anime-format"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const isSeason = radio.value === 'seasons';
      document.getElementById('anime-sequential-section').classList.toggle('hidden', isSeason);
      document.getElementById('anime-seasons-section').classList.toggle('hidden', !isSeason);
    });
  });

  function _buildSeasonRows(containerId, count, prefill = []) {
    const list = document.getElementById(containerId);
    list.innerHTML = '';
    for (let i = 1; i <= count; i++) {
      const existing = prefill.find(s => s.number === i);
      const eps = existing?.episodes || '';
      const name = existing?.name || `Temporada ${i}`;
      const row = document.createElement('div');
      row.className = 'season-row';
      row.innerHTML = `
        <span class="season-row-label">${name}</span>
        <input type="number" min="0" max="10000" placeholder="Eps" value="${eps}" data-season="${i}" />
        <span class="season-row-eps-label">episódios</span>
      `;
      list.appendChild(row);
    }
  }

  function _collectSeasons(containerId) {
    const rows = document.getElementById(containerId).querySelectorAll('.season-row');
    if (!rows.length) return null;
    return Array.from(rows).map(row => ({
      number:   parseInt(row.dataset?.season || row.querySelector('[data-season]')?.dataset.season || '0', 10),
      name:     row.querySelector('.season-row-label')?.textContent || '',
      episodes: parseInt(row.querySelector('input')?.value || '0', 10) || 0,
    }));
  }

  // ── TMDB Search ─────────────────────────────
  const tmdbInput    = document.getElementById('tmdb-search-input');
  const tmdbResults  = document.getElementById('tmdb-results');
  const tmdbSelected = document.getElementById('tmdb-selected');
  const tmdbSpinner  = document.getElementById('tmdb-spinner');
  const tmdbHint     = document.getElementById('tmdb-hint');
  let _tmdbTimeout   = null;

  tmdbInput.addEventListener('input', () => {
    clearTimeout(_tmdbTimeout);
    const q = tmdbInput.value.trim();
    if (!q) { tmdbResults.classList.add('hidden'); tmdbResults.innerHTML = ''; return; }
    tmdbSpinner.classList.remove('hidden');
    _tmdbTimeout = setTimeout(() => _doTmdbSearch(q), 450);
  });

  // Fechar resultados ao clicar fora
  document.addEventListener('click', e => {
    if (!e.target.closest('.tmdb-search-wrap')) {
      tmdbResults.classList.add('hidden');
    }
  });

  async function _doTmdbSearch(query) {
    try {
      const key = (typeof TMDB_API_KEY !== 'undefined') ? TMDB_API_KEY : '';
      if (!key) {
        tmdbResults.innerHTML = `<div class="tmdb-result-no-key">Configure a <strong>TMDB_API_KEY</strong> em firebase-config.js para busca automática</div>`;
        tmdbResults.classList.remove('hidden');
        tmdbSpinner.classList.add('hidden');
        return;
      }
      let results;
      if (_contentType === 'movie')       results = await TMDB.searchMovies(query);
      else                                results = await TMDB.searchTV(query);

      tmdbSpinner.classList.add('hidden');
      if (!results.length) {
        tmdbResults.innerHTML = `<div class="tmdb-result-no-key">Nenhum resultado encontrado</div>`;
        tmdbResults.classList.remove('hidden');
        return;
      }
      tmdbResults.innerHTML = results.map(r => {
        const isAnime = TMDB.isLikelyAnime(r);
        const typeLbl = r.tmdbType === 'movie' ? 'Filme' : (isAnime ? 'Anime' : 'Série');
        const typeCls = r.tmdbType === 'movie' ? '' : (isAnime ? 'anime' : '');
        return `
          <div class="tmdb-result-item" data-tmdbid="${r.tmdbId}" data-tmdbtype="${r.tmdbType}" tabindex="0">
            ${r.posterUrl
              ? `<img class="tmdb-result-poster" src="${r.posterUrl}" alt="" loading="lazy" />`
              : `<div class="tmdb-result-poster-empty"><i class="fa-solid fa-film"></i></div>`}
            <div class="tmdb-result-info">
              <div class="tmdb-result-title">${r.title}</div>
              <div class="tmdb-result-meta">
                <span class="tmdb-type-badge ${typeCls}">${typeLbl}</span>
                ${r.year ? `<span>${r.year}</span>` : ''}
                ${r.voteAverage ? `<span>⭐ ${r.voteAverage.toFixed(1)}</span>` : ''}
              </div>
            </div>
          </div>`;
      }).join('');
      tmdbResults.classList.remove('hidden');

      tmdbResults.querySelectorAll('.tmdb-result-item').forEach(item => {
        item.addEventListener('click', () => _selectTmdbResult(
          results.find(r => String(r.tmdbId) === item.dataset.tmdbid && r.tmdbType === item.dataset.tmdbtype)
        ));
      });
    } catch(err) {
      tmdbSpinner.classList.add('hidden');
      console.error('TMDB search error:', err);
    }
  }

  async function _selectTmdbResult(item) {
    if (!item) return;
    tmdbResults.classList.add('hidden');
    tmdbInput.value = '';
    showLoading(true);
    try {
      let data = item;
      // Para TV, buscar detalhes completos (com temporadas)
      if (item.tmdbType === 'tv') {
        data = await TMDB.getTvDetails(item.tmdbId);
      }
      _tmdbData = data;

      // Determinar tipo automaticamente baseado no resultado
      const isAnime = TMDB.isLikelyAnime(data);
      if (data.tmdbType === 'movie') {
        _setContentType('movie', false);
      } else if (isAnime) {
        _setContentType('anime', false);
      } else {
        _setContentType('series', false);
      }

      // Preencher campos básicos
      document.getElementById('movie-title').value      = data.title;
      document.getElementById('movie-desc-input').value = data.description;

      // Capa do TMDB
      if (data.posterUrlLg) {
        _coverUrlFromTmdb = data.posterUrlLg;
        _coverFile = null;
        _showCover(data.posterUrlLg, '50% 50%');
      }

      // Preencher temporadas para série
      if (data.tmdbType === 'tv' && data.seasons?.length) {
        _seasons = data.seasons;
        if (_contentType === 'series') {
          document.getElementById('series-seasons-count').value = data.totalSeasons || data.seasons.length;
          _buildSeasonRows('seasons-detail-list', data.seasons.length, data.seasons);
        } else if (_contentType === 'anime') {
          // Para anime, pré-selecionar "por temporada" se tem múltiplas temporadas
          if (data.seasons.length > 1) {
            document.querySelector('input[name="anime-format"][value="seasons"]').checked = true;
            document.getElementById('anime-sequential-section').classList.add('hidden');
            document.getElementById('anime-seasons-section').classList.remove('hidden');
            document.getElementById('anime-seasons-count').value = data.seasons.length;
            _buildSeasonRows('anime-seasons-detail-list', data.seasons.length, data.seasons);
          } else {
            // Temporada única → sequencial com total de eps
            document.querySelector('input[name="anime-format"][value="sequential"]').checked = true;
            document.getElementById('anime-sequential-section').classList.remove('hidden');
            document.getElementById('anime-seasons-section').classList.add('hidden');
            document.getElementById('anime-total-eps').value = data.totalEpisodes || (data.seasons[0]?.episodes || '');
          }
        }
      }

      // Badge de seleção — some automaticamente após 4 segundos
      document.getElementById('tmdb-selected-name').textContent = data.title;
      tmdbSelected.classList.remove('hidden');
      tmdbHint.classList.add('hidden');
      clearTimeout(tmdbSelected._hideTimeout);
      tmdbSelected._hideTimeout = setTimeout(() => tmdbSelected.classList.add('hidden'), 4000);

      showToast(`"${data.title}" carregado do TMDB ✅`);
    } catch(err) {
      console.error('TMDB detail error:', err);
      showToast('Erro ao carregar detalhes do TMDB');
    } finally {
      showLoading(false);
    }
  }

  document.getElementById('tmdb-clear-selection').addEventListener('click', () => {
    _tmdbData = null;
    _seasons  = [];
    tmdbSelected.classList.add('hidden');
    tmdbHint.classList.remove('hidden');
    // Não limpa os campos preenchidos para o usuário poder editar
  });

  // ── Categorias e idades ────────────────────
  Movies.onCategories(cats => {
    AppState.categories = cats;
    const container = document.getElementById('movie-category-chips');
    if (!container) return;
    const prev = new Set([...container.querySelectorAll('.chip-opt.active')].map(el => el.dataset.id));
    container.innerHTML = cats.map(c => {
      const active = prev.has(c.id);
      const style = c.color
        ? active
          ? `style="background:${c.color};color:#fff;border-color:${c.color}"`
          : `style="background:transparent;color:${c.color};border-color:${c.color}"`
        : '';
      return `<span class="chip-opt${active ? ' active' : ''}" data-id="${c.id}" ${style}>${c.name}</span>`;
    }).join('');
    container.querySelectorAll('.chip-opt').forEach(chip => {
      chip.addEventListener('click', () => {
        const nowActive = !chip.classList.contains('active');
        chip.classList.toggle('active', nowActive);
        const color = chip.style.color && chip.style.borderColor ? chip.style.borderColor : null;
        if (color) {
          chip.style.background = nowActive ? color : 'transparent';
          chip.style.color = nowActive ? '#fff' : color;
        }
      });
    });
  });

  Movies.onAgeRatings(ages => {
    const sel = document.getElementById('movie-age');
    const cur = sel.value;
    sel.innerHTML = '<option value="">Classificação etária</option>';
    ages.forEach(a => { sel.innerHTML += `<option value="${a.id}">${a.label}</option>`; });
    sel.value = cur;
  });

  // ── Reset ──────────────────────────────────
  _resetAddMovieForm = () => {
    _coverFile = null;
    _coverUrlFromTmdb = null;
    _tmdbData  = null;
    _seasons   = [];
    document.getElementById('form-add-movie').reset();
    _hideCover();
    _setContentType('movie');
    titleH2.textContent  = 'Adicionar';
    submitBtn.innerHTML  = '<i class="fa-solid fa-upload"></i> Publicar';
    deleteBtn.classList.add('hidden');
    tmdbSelected.classList.add('hidden');
    tmdbHint.classList.remove('hidden');
    tmdbInput.value = '';
    tmdbResults.classList.add('hidden');
    // Reset anime format
    const seqRadio = document.querySelector('input[name="anime-format"][value="sequential"]');
    if (seqRadio) { seqRadio.checked = true; }
    document.getElementById('anime-sequential-section').classList.remove('hidden');
    document.getElementById('anime-seasons-section').classList.add('hidden');
  };

  // ── Prefill (edição) ───────────────────────
  _prefillEditForm = (movie) => {
    _coverFile = null;
    _coverUrlFromTmdb = null;
    _tmdbData  = null;
    _seasons   = movie.seasons || [];

    // Tipo
    _setContentType(movie.type || 'movie');

    document.getElementById('movie-title').value      = movie.title       || '';
    document.getElementById('movie-desc-input').value = movie.description || '';

    setTimeout(() => {
      const ids = movie.categoryIds || (movie.categoryId ? [movie.categoryId] : []);
      document.getElementById('movie-category-chips').querySelectorAll('.chip-opt').forEach(chip => {
        chip.classList.toggle('active', ids.includes(chip.dataset.id));
      });
      document.getElementById('movie-age').value = movie.ageRatingId || '';

      // Série: restaurar temporadas
      if (movie.type === 'series' && movie.seasons?.length) {
        document.getElementById('series-seasons-count').value = movie.totalSeasons || movie.seasons.length;
        _buildSeasonRows('seasons-detail-list', movie.seasons.length, movie.seasons);
      }
      // Anime: restaurar formato e eps
      if (movie.type === 'anime') {
        const fmt = movie.animeFormat || 'sequential';
        const radio = document.querySelector(`input[name="anime-format"][value="${fmt}"]`);
        if (radio) radio.checked = true;
        document.getElementById('anime-sequential-section').classList.toggle('hidden', fmt === 'seasons');
        document.getElementById('anime-seasons-section').classList.toggle('hidden', fmt !== 'seasons');
        if (fmt === 'sequential') {
          document.getElementById('anime-total-eps').value = movie.totalEpisodes || '';
        } else if (movie.seasons?.length) {
          document.getElementById('anime-seasons-count').value = movie.totalSeasons || movie.seasons.length;
          _buildSeasonRows('anime-seasons-detail-list', movie.seasons.length, movie.seasons);
        }
      }
    }, 100);

    if (movie.coverUrl) _showCover(movie.coverUrl, movie.coverPosition || '50% 50%');
    else _hideCover();

    titleH2.textContent = 'Editar';
    submitBtn.innerHTML = '<i class="fa-solid fa-check"></i> Salvar alterações';
    deleteBtn.classList.remove('hidden');

    // Mostrar badge TMDB se tiver tmdbId
    if (movie.tmdbId) {
      document.getElementById('tmdb-selected-name').textContent = movie.title;
      tmdbSelected.classList.remove('hidden');
      tmdbHint.classList.add('hidden');
    }
  };

  // ── Botão excluir ─────────────────────────
  deleteBtn.addEventListener('click', async () => {
    if (!AppState.editingMovieId) return;
    showModal('Excluir', '<p>Tem certeza? Esta ação não pode ser desfeita.</p>', async () => {
      try {
        showLoading(true);
        await Movies.deleteMovie(AppState.editingMovieId);
        showToast('Conteúdo excluído');
        AppState.editingMovieId = null;
        _resetAddMovieForm();
        closeModal();
        navigateTo('movies');
      } catch(e) { showToast(e.message); }
      finally { showLoading(false); }
    });
  });

  // ── Botão voltar ──────────────────────────
  document.getElementById('add-movie-back').addEventListener('click', () => {
    if (AppState.editingMovieId) {
      const id = AppState.editingMovieId;
      AppState.editingMovieId = null;
      _resetAddMovieForm();
      navigateTo('movie-detail');
      AppState.prevView = AppState._preEditPrevView || 'movies';
      openMovieDetail(id, false, true);
    } else {
      navigateTo(AppState.prevView || 'movies');
    }
  });

  // ── Submit ────────────────────────────────
  document.getElementById('form-add-movie').addEventListener('submit', async e => {
    e.preventDefault();
    if (!AppState.user) { showToast('Faça login primeiro'); return; }

    const categoryIds = [...document.getElementById('movie-category-chips').querySelectorAll('.chip-opt.active')]
      .map(el => el.dataset.id);
    if (!categoryIds.length) { showToast('Selecione ao menos uma categoria'); return; }

    // Coletar dados extras de série / anime
    let seasons = null, totalSeasons = null, animeFormat = null, totalEpisodes = null;
    if (_contentType === 'series') {
      seasons = _collectSeasons('seasons-detail-list');
      totalSeasons = seasons?.length || parseInt(document.getElementById('series-seasons-count').value, 10) || null;
    } else if (_contentType === 'anime') {
      const fmt = document.querySelector('input[name="anime-format"]:checked')?.value || 'sequential';
      animeFormat = fmt;
      if (fmt === 'sequential') {
        totalEpisodes = parseInt(document.getElementById('anime-total-eps').value, 10) || null;
      } else {
        seasons = _collectSeasons('anime-seasons-detail-list');
        totalSeasons = seasons?.length || parseInt(document.getElementById('anime-seasons-count').value, 10) || null;
      }
    }

    const data = {
      title:         document.getElementById('movie-title').value,
      description:   document.getElementById('movie-desc-input').value,
      categoryIds,
      ageRatingId:   document.getElementById('movie-age').value,
      coverPosition: _coverPos || '50% 50%',
      type:          _contentType,
      tmdbId:        _tmdbData?.tmdbId || null,
      seasons,
      totalSeasons,
      animeFormat,
      totalEpisodes,
    };

    try {
      showLoading(true);
      if (AppState.editingMovieId) {
        await Movies.updateMovie(AppState.editingMovieId, data, _coverFile || null, _coverUrlFromTmdb);
        showToast('Atualizado! ✅');
        const editedId = AppState.editingMovieId;
        AppState.editingMovieId = null;
        _resetAddMovieForm();
        navigateTo('movie-detail');
        AppState.prevView = AppState._preEditPrevView || 'movies';
        openMovieDetail(editedId, false, true);
      } else {
        await Movies.addMovie(data, _coverFile, _coverUrlFromTmdb);
        const typeLabel = { movie: 'Filme', series: 'Série', anime: 'Anime' }[_contentType] || 'Conteúdo';
        showToast(`${typeLabel} publicado! 🎬`);
        _resetAddMovieForm();
        navigateTo('movies');
      }
    } catch(err) {
      showToast(err.message);
    } finally {
      showLoading(false);
    }
  });
})();

function openEditMovie(movie) {
  AppState.editingMovieId = movie.id;
  AppState._preEditPrevView = AppState.prevView;
  _prefillEditForm(movie);
  navigateTo('add-movie');
}

// ── WATCHLIST ──────────────────────────────────
let _watchlistRenderGen = 0;

function initWatchlistView() {
  const coupleId = AppState.coupleDoc?.id;
  const container = document.getElementById('watchlist-container');
  if (!coupleId) { container.innerHTML = '<p class="empty-text">Conecte-se a um parceiro primeiro</p>'; return; }

  if (AppState._watchlistUnsub) { AppState._watchlistUnsub(); AppState._watchlistUnsub = null; }

  container.innerHTML = '<p class="empty-text">Carregando...</p>';

  AppState._watchlistUnsub = db.collection('watchlist')
    .where('coupleId', '==', coupleId)
    .onSnapshot(async snap => {
      const gen = ++_watchlistRenderGen;
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.addedAt?.seconds || 0) - (a.addedAt?.seconds || 0));

      if (!items.length) {
        container.innerHTML = `<div class="feed-empty"><img src="refs/personagem.png" class="empty-mascot"/><p>Nenhum filme na watchlist ainda</p><button class="btn btn-primary" data-nav="movies">Explorar filmes</button></div>`;
        return;
      }
      container.innerHTML = '';
      for (const item of items) {
        const movie = await Movies.getMovie(item.movieId);
        if (gen !== _watchlistRenderGen) return;
        if (!movie) continue;
        container.appendChild(buildListMovieItem(movie, async () => {
          await Movies.removeFromWatchlist(coupleId, item.movieId);
          showToast('Removido da watchlist');
        }));
      }
    }, err => { console.error(err); container.innerHTML = '<p class="empty-text">Erro ao carregar</p>'; });
}

// ── FAVORITOS ──────────────────────────────────
let _favoritesRenderGen = 0;

function initFavoritesView() {
  const coupleId = AppState.coupleDoc?.id;
  const container = document.getElementById('favorites-container');
  if (!coupleId) { container.innerHTML = '<p class="empty-text">Conecte-se a um parceiro primeiro</p>'; return; }

  if (AppState._favoritesUnsub) { AppState._favoritesUnsub(); AppState._favoritesUnsub = null; }

  container.innerHTML = '<p class="empty-text">Carregando...</p>';

  AppState._favoritesUnsub = db.collection('favorites')
    .where('coupleId', '==', coupleId)
    .onSnapshot(async snap => {
      const gen = ++_favoritesRenderGen;
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.addedAt?.seconds || 0) - (a.addedAt?.seconds || 0));

      if (!items.length) {
        container.innerHTML = `<div class="feed-empty"><img src="refs/personagem.png" class="empty-mascot"/><p>Nenhum favorito ainda</p><button class="btn btn-primary" data-nav="movies">Explorar filmes</button></div>`;
        return;
      }
      container.innerHTML = '';
      for (const item of items) {
        const movie = await Movies.getMovie(item.movieId);
        if (gen !== _favoritesRenderGen) return;
        if (!movie) continue;
        container.appendChild(buildListMovieItem(movie, async () => {
          await Movies.addToFavorites(coupleId, item.movieId);
        }));
      }
    }, err => { console.error(err); container.innerHTML = '<p class="empty-text">Erro ao carregar</p>'; });
}

function buildListMovieItem(movie, onRemove) {
  const cat = AppState.categories.find(c => c.id === movie.categoryId);
  const el = document.createElement('div');
  el.className = 'list-movie-item';
  el.innerHTML = `
    ${movie.coverUrl
      ? `<img class="list-movie-thumb" src="${movie.coverUrl}" alt="${movie.title}" loading="lazy" style="object-position:${movie.coverPosition||'50% 50%'}" />`
      : `<div class="list-movie-thumb"></div>`}
    <div class="list-movie-info">
      <div class="list-movie-title">${movie.title}</div>
      <div class="list-movie-cat">${cat ? `<span class="badge-cat-card" ${cat.color ? `style="background:${cat.color};color:#fff"` : ''}>${cat.name}</span>` : ''}</div>
    </div>
    <button class="list-movie-remove">🗑️</button>
  `;
  el.querySelector('.list-movie-info').addEventListener('click', () => openMovieDetail(movie.id));
  el.querySelector('.list-movie-remove').addEventListener('click', onRemove);
  return el;
}

// ── PERFIL ─────────────────────────────────────
function _resetProfileView(isOwn) {
  document.getElementById('profile-couple-names').textContent = '—';
  document.getElementById('profile-couple-since').textContent = 'Casal desde —';
  document.getElementById('profile-score-num').textContent = '0';
  document.getElementById('stat-watched').textContent = '0';
  document.getElementById('stat-favorites').textContent = '0';
  document.getElementById('stat-followers').textContent = '0';
  document.getElementById('profile-tab-content').innerHTML = '';
  document.getElementById('profile-avatar1').innerHTML = '<i class="fa-solid fa-user"></i>';
  document.getElementById('profile-avatar2').innerHTML = '<i class="fa-solid fa-user"></i>';
  document.getElementById('profile-back-btn').classList.toggle('hidden', isOwn);
  document.getElementById('profile-settings-btn').classList.toggle('hidden', !isOwn);
  document.getElementById('profile-own-actions').classList.toggle('hidden', !isOwn);
  document.getElementById('profile-other-actions').classList.toggle('hidden', isOwn);
}

async function initProfileView(coupleId, isOwn = true) {
  _resetProfileView(isOwn);
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
    a1.innerHTML = _avatarImg(u1);
    a2.innerHTML = _avatarImg(u2);

    document.getElementById('profile-score-num').textContent = couple.score || 0;
    document.getElementById('stat-watched').textContent  = couple.moviesWatched || 0;
    document.getElementById('stat-favorites').textContent = couple.favoritesCount || 0;
    document.getElementById('stat-followers').textContent = couple.followersCount || 0;

    // Botão voltar (apenas quando perfil alheio)
    const backBtn = document.getElementById('profile-back-btn');
    backBtn.classList.toggle('hidden', isOwn);
    backBtn.onclick = () => navigateTo(AppState.prevView || 'feed');

    // Abas — clonar para remover listeners antigos acumulados de visitas anteriores
    document.querySelectorAll('.profile-tab').forEach(tab => {
      const fresh = tab.cloneNode(true);
      tab.replaceWith(fresh);
    });
    document.querySelectorAll('.profile-tab').forEach((tab, i) => {
      tab.classList.toggle('active', i === 0);
      tab.addEventListener('click', () => {
        document.querySelectorAll('.profile-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        loadProfileTab(coupleId, tab.dataset.ptab, isOwn);
      });
    });
    loadProfileTab(coupleId, 'watched', isOwn);

    // Ações (own-actions/other-actions já foram alternados pelo _resetProfileView)
    if (!isOwn) {
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

let _profileTabGen = 0;

async function loadProfileTab(coupleId, tab, isOwn = true) {
  const gen = ++_profileTabGen;
  const container = document.getElementById('profile-tab-content');
  container.innerHTML = '<p class="empty-text">Carregando...</p>';

  try {
    let items = [];
    if (tab === 'watched')   items = await Movies.getWatched(coupleId);
    if (tab === 'favorites') items = await Movies.getFavorites(coupleId);
    if (tab === 'watchlist') items = await Movies.getWatchlist(coupleId);

    if (gen !== _profileTabGen) return;

    if (!items.length) {
      container.innerHTML = '<p class="empty-text" style="grid-column:1/-1">Nenhum filme aqui ainda</p>';
      return;
    }

    container.innerHTML = '';
    for (const item of items) {
      const movie = await Movies.getMovie(item.movieId);
      if (gen !== _profileTabGen) return;
      if (!movie) continue;
      const img = document.createElement('img');
      img.className = 'profile-movie-thumb';
      img.src = movie.coverUrl || '';
      img.alt = movie.title;
      img.style.objectPosition = movie.coverPosition || '50% 50%';
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
let _discoverGen = 0;

async function initDiscoverView() {
  const list = document.getElementById('discover-list');
  list.innerHTML = '<p class="empty-text">Carregando...</p>';

  const searchInput = document.getElementById('discover-search');
  searchInput.value = '';
  searchInput.oninput = _debounce(async () => {
    const q = searchInput.value.trim();
    if (q) {
      const gen = ++_discoverGen;
      const results = await Couple.searchCoupleByNickname(q);
      if (gen !== _discoverGen) return;
      renderCouplesList(results, list, gen);
    } else {
      loadDiscoverCouples();
    }
  }, 500);

  loadDiscoverCouples();
}

async function loadDiscoverCouples() {
  const gen = ++_discoverGen;
  const list    = document.getElementById('discover-list');
  const podium  = document.getElementById('podium-list');
  const podSect = document.getElementById('podium-section');
  const regTitle = document.getElementById('discover-regular-title');
  try {
    const couples = await Couple.listCouples(50);
    if (gen !== _discoverGen) return;
    const myId = AppState.coupleDoc?.id;

    // Buscar nomes de todos os casais para permitir desempate alfabético
    const userCache = {};
    await Promise.all(
      couples.flatMap(c => [c.user1, c.user2]).map(async uid => {
        if (!userCache[uid]) userCache[uid] = await Auth.fetchUserDoc(uid);
      })
    );
    if (gen !== _discoverGen) return;

    function coupleName(c) {
      const u1 = userCache[c.user1];
      const u2 = userCache[c.user2];
      return `${u1?.name || ''} & ${u2?.name || ''}`.toLowerCase();
    }

    const sorted = couples.sort((a, b) => {
      const scoreDiff = (b.score || 0) - (a.score || 0);
      if (scoreDiff !== 0) return scoreDiff;
      return coupleName(a).localeCompare(coupleName(b), 'pt-BR');
    });

    const top3 = sorted.slice(0, 3);
    const rest = sorted.slice(3);

    // Renderizar pódio
    if (top3.length >= 1) {
      podSect.classList.remove('hidden');
      podium.innerHTML = '';
      const medals = ['🥇', '🥈', '🥉'];
      for (let i = 0; i < top3.length; i++) {
        const c = top3[i];
        const u1 = userCache[c.user1];
        const u2 = userCache[c.user2];
        if (gen !== _discoverGen) return;
        const card = document.createElement('div');
        card.className = `podium-card podium-card-${i + 1}`;
        const isYou = c.id === myId;
        if (isYou) card.style.cssText += ';border-color:var(--cyan);';
        card.innerHTML = `
          <div class="podium-medal">${medals[i]}</div>
          <div class="podium-avatars">
            <div class="avatar">${_avatarImg(u1)}</div>
            <div class="avatar">${_avatarImg(u2)}</div>
          </div>
          <div class="podium-names">${u1?.name || '?'} & ${u2?.name || '?'}${isYou ? ' <span class="badge-you">Você</span>' : ''}</div>
          <div class="podium-score">${c.score || 0} pts</div>
        `;
        card.addEventListener('click', () => navigateTo('profile', { coupleId: c.id, isOwn: c.id === myId }));
        podium.appendChild(card);
      }
    } else {
      podSect.classList.add('hidden');
    }

    // Renderizar lista geral (já ordenada, passamos o cache de users)
    regTitle.style.display = rest.length ? '' : 'none';
    renderCouplesList(rest, list, gen, userCache);
  } catch(e) {
    list.innerHTML = '<p class="empty-text">Erro ao carregar</p>';
  }
}

async function renderCouplesList(couples, container, gen = _discoverGen, userCache = {}) {
  if (!couples.length) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = '';
  for (const c of couples) {
    // Usa cache se disponível, senão busca
    const [u1, u2] = await Promise.all([
      userCache[c.user1] ? Promise.resolve(userCache[c.user1]) : Auth.fetchUserDoc(c.user1),
      userCache[c.user2] ? Promise.resolve(userCache[c.user2]) : Auth.fetchUserDoc(c.user2),
    ]);
    if (gen !== _discoverGen) return;
    const el = document.createElement('div');
    const isYouItem = c.id === AppState.coupleDoc?.id;
    el.className = `couple-item${isYouItem ? ' couple-item-you' : ''}`;
    el.innerHTML = `
      <div class="couple-item-avatars">
        <div class="avatar">${_avatarImg(u1)}</div>
        <div class="avatar">${_avatarImg(u2)}</div>
      </div>
      <div class="couple-item-info">
        <div class="couple-item-names">${u1?.name || '?'} & ${u2?.name || '?'}${isYouItem ? ' <span class="badge-you">Você</span>' : ''}</div>
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
  // Marcar todas como lidas ao abrir
  if (AppState.user?.uid) Feed.markAllNotifsRead(AppState.user.uid).catch(() => {});
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
    invite_accepted:  '<i class="fa-solid fa-heart"></i>',
    new_follower:     '<i class="fa-solid fa-users"></i>',
    partner_watched:  '<i class="fa-solid fa-eye"></i>',
    partner_rated:    '<i class="fa-solid fa-star"></i>',
    partner_favorited:'<i class="fa-solid fa-bookmark"></i>',
    new_movie:        '<i class="fa-solid fa-film"></i>',
    default:          '<i class="fa-solid fa-bell"></i>'
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
  let _avatarPos  = doc.avatarPosition || '50% 50%';
  let _avatarFile = null;

  // Remover listeners de drag de visita anterior
  if (avatarEl._dragCleanup) { avatarEl._dragCleanup(); avatarEl._dragCleanup = null; }

  function _applyAvatar(url, pos) {
    _avatarPos = pos || '50% 50%';
    avatarEl.innerHTML = `<img src="${url}" alt="" style="object-fit:cover;width:100%;height:100%;object-position:${_avatarPos};cursor:grab" />`;
    const hint = document.getElementById('avatar-reposition-hint');
    if (hint) hint.classList.remove('hidden');
    _setupAvatarDrag(avatarEl.querySelector('img'));
  }

  function _setupAvatarDrag(img) {
    if (!img) return;
    let _drag = false;
    let _dragStart = { x: 0, y: 0 };
    let _posStart  = { x: 50, y: 50 };

    function _onMouseMove(e) {
      if (!_drag) return;
      const rect = avatarEl.getBoundingClientRect();
      const nx = Math.max(0, Math.min(100, _posStart.x - (e.clientX - _dragStart.x) / rect.width  * 100));
      const ny = Math.max(0, Math.min(100, _posStart.y - (e.clientY - _dragStart.y) / rect.height * 100));
      _avatarPos = `${nx.toFixed(1)}% ${ny.toFixed(1)}%`;
      img.style.objectPosition = _avatarPos;
    }
    function _onMouseUp() { if (_drag) { _drag = false; img.style.cursor = 'grab'; } }
    function _onTouchMove(e) {
      if (!_drag) return;
      const t = e.touches[0];
      const rect = avatarEl.getBoundingClientRect();
      const nx = Math.max(0, Math.min(100, _posStart.x - (t.clientX - _dragStart.x) / rect.width  * 100));
      const ny = Math.max(0, Math.min(100, _posStart.y - (t.clientY - _dragStart.y) / rect.height * 100));
      _avatarPos = `${nx.toFixed(1)}% ${ny.toFixed(1)}%`;
      img.style.objectPosition = _avatarPos;
    }
    function _onTouchEnd() { _drag = false; }

    img.addEventListener('mousedown', e => {
      e.preventDefault();
      _drag = true;
      _dragStart = { x: e.clientX, y: e.clientY };
      const p = _avatarPos.split(' ');
      _posStart = { x: parseFloat(p[0]), y: parseFloat(p[1]) };
      img.style.cursor = 'grabbing';
    });
    document.addEventListener('mousemove', _onMouseMove);
    document.addEventListener('mouseup',   _onMouseUp);
    img.addEventListener('touchstart', e => {
      _drag = true;
      const t = e.touches[0];
      _dragStart = { x: t.clientX, y: t.clientY };
      const p = _avatarPos.split(' ');
      _posStart = { x: parseFloat(p[0]), y: parseFloat(p[1]) };
    }, { passive: true });
    document.addEventListener('touchmove', _onTouchMove);
    document.addEventListener('touchend',  _onTouchEnd);

    avatarEl._dragCleanup = () => {
      document.removeEventListener('mousemove', _onMouseMove);
      document.removeEventListener('mouseup',   _onMouseUp);
      document.removeEventListener('touchmove', _onTouchMove);
      document.removeEventListener('touchend',  _onTouchEnd);
    };
  }

  if (doc.avatarUrl) {
    _applyAvatar(doc.avatarUrl, _avatarPos);
  } else {
    avatarEl.innerHTML = '<i class="fa-solid fa-user"></i>';
    const hint = document.getElementById('avatar-reposition-hint');
    if (hint) hint.classList.add('hidden');
  }

  document.getElementById('btn-change-avatar').onclick = () => {
    document.getElementById('avatar-file').click();
  };

  document.getElementById('avatar-file').onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    _avatarFile = file;
    _applyAvatar(URL.createObjectURL(file), '50% 50%');
  };

  document.getElementById('btn-save-settings').onclick = async () => {
    const name = document.getElementById('settings-name').value.trim();
    if (!name) { showToast('Digite seu nome'); return; }
    showLoading(true);
    try {
      if (_avatarFile) {
        await Auth.uploadAvatar(user.uid, _avatarFile);
        _avatarFile = null;
      }
      await Auth.updateProfile(user.uid, { name, avatarPosition: _avatarPos });
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

function _avatarImg(userDoc) {
  if (!userDoc?.avatarUrl) return '<i class="fa-solid fa-user"></i>';
  return `<img src="${userDoc.avatarUrl}" alt="" style="object-position:${userDoc.avatarPosition||'50% 50%'}">`;
}

// Expor para o feed
window._app = { openMovieDetail };
