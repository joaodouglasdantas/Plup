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

  // Cancelar listener anterior
  if (AppState._feedUnsub) { AppState._feedUnsub(); AppState._feedUnsub = null; }

  showLoading(true);
  let firstEmit = true;

  try {
    const followingIds = await Couple.getFollowing(coupleId);
    const allIds = [coupleId, ...followingIds];

    AppState._feedUnsub = Feed.onFeed(allIds, async (events) => {
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
        const coupleDoc = await Couple.getCoupleDoc(ev.coupleId);
        if (!coupleDoc) continue;
        const card = await Feed.renderFeedCard(ev, coupleDoc, AppState.categories);
        container.appendChild(card);
      }
    });
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
    if (a1) a1.innerHTML = u1?.avatarUrl ? `<img src="${u1.avatarUrl}" alt="">` : '<i class="fa-solid fa-user"></i>';
    if (a2) a2.innerHTML = u2?.avatarUrl ? `<img src="${u2.avatarUrl}" alt="">` : '<i class="fa-solid fa-user"></i>';
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
    const filtered = catId === 'all' ? _moviesAll : _moviesAll.filter(m => m.categoryId === catId);
    renderMoviesGrid(filtered);
  } else {
    // Primeiro acesso — abre listener para TODOS os filmes
    _moviesUnsub = Movies.onMovies(movies => {
      _moviesAll = movies;
      const filtered = _currentCat === 'all' ? movies : movies.filter(m => m.categoryId === _currentCat);
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
    const cat = AppState.categories.find(c => c.id === m.categoryId);
    const rating = ''; // simplificado
    return `
      <div class="movie-card" onclick="openMovieDetail('${m.id}')">
        ${m.coverUrl
          ? `<img class="movie-card-cover" src="${m.coverUrl}" alt="${m.title}" loading="lazy" />`
          : `<div class="movie-card-cover"></div>`}
        <div class="movie-card-info">
          <div class="movie-card-title">${m.title}</div>
          <div class="movie-card-cat">${cat ? `<span class="badge-cat-card" ${cat.color ? `style="background:${cat.color};color:#fff"` : ''}>${cat.name}</span>` : ''}</div>
        </div>
      </div>
    `;
  }).join('');
}

// ── DETALHE DO FILME ───────────────────────────
async function openMovieDetail(movieId, readOnly = false) {
  AppState.currentMovieId = movieId;
  navigateTo('movie-detail');

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
    coverEl.style.display = movie.coverUrl ? '' : 'none';

    const cat = AppState.categories.find(c => c.id === movie.categoryId);
    const age = AppState.ageRatings.find(a => a.id === movie.ageRatingId);
    const catEl = document.getElementById('movie-detail-cat');
    catEl.innerHTML = cat ? cat.name : '—';
    if (cat?.color) { catEl.style.background = cat.color; catEl.style.color = '#fff'; }
    else { catEl.style.background = ''; catEl.style.color = ''; }
    document.getElementById('movie-detail-age').textContent = age?.label || '';

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

// ── ADICIONAR / EDITAR FILME ───────────────────
let _prefillEditForm = null;
let _resetAddMovieForm = null;

(function setupAddMovie() {
  const uploadArea  = document.getElementById('cover-upload-area');
  const fileInput   = document.getElementById('cover-file');
  const placeholder = document.getElementById('cover-placeholder');
  const preview     = document.getElementById('cover-preview');
  const titleH2     = document.querySelector('#view-add-movie .top-bar h2');
  const submitBtn   = document.querySelector('#form-add-movie [type="submit"]');
  let _coverFile    = null;

  uploadArea.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', e => {
    _coverFile = e.target.files[0];
    if (_coverFile) {
      preview.src = URL.createObjectURL(_coverFile);
      preview.classList.remove('hidden');
      placeholder.style.display = 'none';
    }
  });

  // Expor reset para uso externo
  _resetAddMovieForm = () => {
    _coverFile = null;
    document.getElementById('form-add-movie').reset();
    preview.src = '';
    preview.classList.add('hidden');
    placeholder.style.display = '';
    titleH2.textContent  = 'Adicionar Filme';
    submitBtn.innerHTML  = '<i class="fa-solid fa-upload"></i> Publicar Filme';
  };

  // Expor pré-preenchimento para modo edição
  _prefillEditForm = (movie) => {
    _coverFile = null;
    document.getElementById('movie-title').value      = movie.title       || '';
    document.getElementById('movie-desc-input').value = movie.description || '';
    // selects carregados async — aguardar um tick
    setTimeout(() => {
      document.getElementById('movie-category').value = movie.categoryId  || '';
      document.getElementById('movie-age').value      = movie.ageRatingId || '';
    }, 100);
    if (movie.coverUrl) {
      preview.src = movie.coverUrl;
      preview.classList.remove('hidden');
      placeholder.style.display = 'none';
    } else {
      preview.src = '';
      preview.classList.add('hidden');
      placeholder.style.display = '';
    }
    titleH2.textContent = 'Editar Filme';
    submitBtn.innerHTML = '<i class="fa-solid fa-check"></i> Salvar alterações';
  };

  // Preencher selects com categorias e idades
  Movies.onCategories(cats => {
    const sel = document.getElementById('movie-category');
    const cur = sel.value;
    sel.innerHTML = '<option value="">Selecionar categoria</option>';
    cats.forEach(c => { sel.innerHTML += `<option value="${c.id}">${c.icon} ${c.name}</option>`; });
    sel.value = cur;
  });

  Movies.onAgeRatings(ages => {
    const sel = document.getElementById('movie-age');
    const cur = sel.value;
    sel.innerHTML = '<option value="">Classificação etária</option>';
    ages.forEach(a => { sel.innerHTML += `<option value="${a.id}">${a.label}</option>`; });
    sel.value = cur;
  });

  // Botão voltar — respeita modo edição
  document.getElementById('add-movie-back').addEventListener('click', () => {
    if (AppState.editingMovieId) {
      const id = AppState.editingMovieId;
      AppState.editingMovieId = null;
      _resetAddMovieForm();
      navigateTo('movie-detail');
      openMovieDetail(id);
    } else {
      navigateTo(AppState.prevView || 'movies');
    }
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
      if (AppState.editingMovieId) {
        await Movies.updateMovie(AppState.editingMovieId, data, _coverFile || null);
        showToast('Filme atualizado! ✅');
        const editedId = AppState.editingMovieId;
        AppState.editingMovieId = null;
        _resetAddMovieForm();
        navigateTo('movie-detail');
        openMovieDetail(editedId);
      } else {
        await Movies.addMovie(data, _coverFile);
        showToast('Filme publicado! 🎬');
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
  _prefillEditForm(movie);
  navigateTo('add-movie');
}

// ── WATCHLIST ──────────────────────────────────
async function initWatchlistView() {
  const coupleId = AppState.coupleDoc?.id;
  const container = document.getElementById('watchlist-container');
  if (!coupleId) { container.innerHTML = '<p class="empty-text">Conecte-se a um parceiro primeiro</p>'; return; }

  showLoading(true);
  try {
    const items = await Movies.getWatchlist(coupleId);
    if (!items.length) {
      container.innerHTML = `<div class="feed-empty"><img src="refs/personagem.png" class="empty-mascot"/><p>Nenhum filme na watchlist ainda</p><button class="btn btn-primary" data-nav="movies">Explorar filmes</button></div>`;
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
      container.innerHTML = `<div class="feed-empty"><img src="refs/personagem.png" class="empty-mascot"/><p>Nenhum favorito ainda</p><button class="btn btn-primary" data-nav="movies">Explorar filmes</button></div>`;
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
      <div class="list-movie-cat">${cat ? `<span class="badge-cat-card" ${cat.color ? `style="background:${cat.color};color:#fff"` : ''}>${cat.name}</span>` : ''}</div>
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
