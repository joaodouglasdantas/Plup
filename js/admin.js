/**
 * PLUP — Painel Admin
 * Gerenciar categorias, idades, denúncias, filmes, score config
 */

const Admin = (() => {

  // ── Render painel completo ─────────────────
  function initAdmin() {
    if (!Auth.isAdmin()) {
      showToast('Acesso restrito 🔒');
      navigateTo('feed');
      return;
    }
    setupAdminTabs();
    loadCategories();
    loadAgeRatings();
    loadReports();
    loadAllMovies();
    loadScoreConfig();
  }

  // ── Tabs ──────────────────────────────────
  function setupAdminTabs() {
    document.querySelectorAll('.admin-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(`admin-${tab.dataset.atab}`).classList.add('active');
      });
    });
  }

  // ── Categorias ────────────────────────────
  function loadCategories() {
    Movies.onCategories(cats => {
      const list = document.getElementById('categories-list');
      if (!cats.length) { list.innerHTML = '<p class="empty-text">Nenhuma categoria cadastrada</p>'; return; }
      list.innerHTML = cats.map(c => {
        const badge = `<span class="badge-age" style="background:${c.color || 'var(--cyan-l)'};color:${c.color ? '#fff' : 'var(--navy)'}">${c.name}</span>`;
        return `
          <div class="admin-item">
            ${badge}
            <span class="admin-item-name">${c.name}</span>
            <button class="admin-item-delete" data-id="${c.id}" onclick="Admin.deleteCategory('${c.id}')">🗑️</button>
          </div>
        `;
      }).join('');
    });

    document.getElementById('btn-add-category').onclick = async () => {
      const name = document.getElementById('new-category-name').value.trim();
      const color = document.getElementById('new-category-color').value;
      if (!name) { showToast('Digite o nome da categoria'); return; }
      try {
        await Movies.addCategory(name, color);
        document.getElementById('new-category-name').value = '';
        document.getElementById('new-category-icon').value = '';
        showToast('Categoria adicionada! ✅');
      } catch(e) { showToast(e.message); }
    };
  }

  async function deleteCategory(id) {
    if (!confirm('Deletar esta categoria?')) return;
    await Movies.deleteCategory(id);
    showToast('Categoria removida');
  }

  // ── Classificações etárias ─────────────────
  function loadAgeRatings() {
    Movies.onAgeRatings(ages => {
      const list = document.getElementById('ages-list');
      if (!ages.length) { list.innerHTML = '<p class="empty-text">Nenhuma classificação cadastrada</p>'; return; }
      list.innerHTML = ages.map(a => `
        <div class="admin-item">
          <span class="badge-age" style="background:${a.color || '#FFB703'};color:#fff">${a.label}</span>
          <span class="admin-item-name">${a.label}</span>
          <button class="admin-item-delete" onclick="Admin.deleteAgeRating('${a.id}')">🗑️</button>
        </div>
      `).join('');
    });

    document.getElementById('btn-add-age').onclick = async () => {
      const label = document.getElementById('new-age-label').value.trim();
      const color = document.getElementById('new-age-color').value;
      if (!label) { showToast('Digite o rótulo da classificação'); return; }
      try {
        await Movies.addAgeRating(label, color);
        document.getElementById('new-age-label').value = '';
        showToast('Classificação adicionada! ✅');
      } catch(e) { showToast(e.message); }
    };
  }

  async function deleteAgeRating(id) {
    if (!confirm('Deletar esta classificação?')) return;
    await Movies.deleteAgeRating(id);
    showToast('Classificação removida');
  }

  // ── Denúncias ─────────────────────────────
  function loadReports() {
    db.collection('reports').where('status', '==', 'pending')
      .onSnapshot(async snap => {
        const list = document.getElementById('reports-list');
        if (snap.empty) {
          list.innerHTML = '<p class="empty-text">Nenhuma denúncia pendente 🎉</p>';
          return;
        }
        list.innerHTML = '';
        const sortedDocs = snap.docs.slice().sort((a, b) =>
          (b.data().createdAt?.seconds || 0) - (a.data().createdAt?.seconds || 0));
        for (const doc of sortedDocs) {
          const report = { id: doc.id, ...doc.data() };
          let targetInfo = '';
          if (report.type === 'movie') {
            const movie = await Movies.getMovie(report.targetId);
            targetInfo = `Filme: <strong class="report-movie-link" style="cursor:pointer;color:var(--blue);text-decoration:underline" onclick="openMovieDetail('${report.targetId}')">${movie?.title || report.targetId}</strong>`;
          } else {
            targetInfo = `Casal ID: ${report.targetId}`;
          }
          const el = document.createElement('div');
          el.className = 'admin-item';
          el.style.flexDirection = 'column';
          el.style.alignItems = 'flex-start';
          el.innerHTML = `
            <div style="font-size:.8rem;color:var(--gray-5);margin-bottom:6px">${targetInfo}</div>
            <div style="font-size:.85rem;font-weight:700;color:var(--navy);margin-bottom:8px">Motivo: ${report.reason || 'Sem descrição'}</div>
            <div style="display:flex;gap:8px;">
              <button class="btn btn-danger btn-sm" onclick="Admin.resolveReport('${report.id}','${report.targetId}','${report.type}',true)">Remover conteúdo</button>
              <button class="btn btn-ghost btn-sm" onclick="Admin.resolveReport('${report.id}','${report.targetId}','${report.type}',false)">Ignorar</button>
            </div>
          `;
          list.appendChild(el);
        }
      });
  }

  async function resolveReport(reportId, targetId, type, remove) {
    if (remove) {
      if (type === 'movie') await Movies.deleteMovie(targetId);
      showToast('Conteúdo removido');
    } else {
      showToast('Denúncia ignorada');
    }
    await db.collection('reports').doc(reportId).update({ status: remove ? 'actioned' : 'dismissed' });
  }

  // ── Moderação de filmes ────────────────────
  function loadAllMovies() {
    db.collection('movies').orderBy('createdAt', 'desc').limit(50)
      .onSnapshot(snap => {
        const list = document.getElementById('admin-movies-list');
        if (snap.empty) { list.innerHTML = '<p class="empty-text">Nenhum filme cadastrado</p>'; return; }
        list.innerHTML = snap.docs.map(doc => {
          const m = { id: doc.id, ...doc.data() };
          return `
            <div class="admin-item">
              ${m.coverUrl ? `<img src="${m.coverUrl}" style="width:36px;height:50px;object-fit:cover;border-radius:6px;" />` : '🎬'}
              <span class="admin-item-name">${m.title}</span>
              <span style="font-size:.7rem;padding:3px 8px;background:${m.approved?'var(--cyan-l)':'#FFE4E1'};border-radius:100px;color:var(--navy)">
                ${m.approved ? 'ativo' : 'oculto'}
              </span>
              <button class="admin-item-delete" onclick="Admin.toggleMovie('${m.id}',${m.approved})">
                ${m.approved ? '🚫' : '✅'}
              </button>
              <button class="admin-item-delete" onclick="Admin.removeMovie('${m.id}')">🗑️</button>
            </div>
          `;
        }).join('');
      });
  }

  async function toggleMovie(movieId, current) {
    await Movies.setApproved(movieId, !current);
    showToast(!current ? 'Filme reativado ✅' : 'Filme ocultado 🚫');
  }

  async function removeMovie(movieId) {
    if (!confirm('Deletar este filme permanentemente?')) return;
    await Movies.deleteMovie(movieId);
    showToast('Filme deletado');
  }

  // ── Configuração de score ─────────────────
  async function loadScoreConfig() {
    const cfg = await Couple.getScoreConfig();
    document.getElementById('cfg-pts-watched').value  = cfg.ptsWatched  ?? 5;
    document.getElementById('cfg-pts-rating').value   = cfg.ptsRating   ?? 2;
    document.getElementById('cfg-pts-favorite').value = cfg.ptsFavorite ?? 1;
    document.getElementById('cfg-max-score').value    = cfg.maxScore    ?? 100;

    document.getElementById('btn-save-score-config').onclick = async () => {
      const newCfg = {
        ptsWatched:  parseInt(document.getElementById('cfg-pts-watched').value)  || 5,
        ptsRating:   parseInt(document.getElementById('cfg-pts-rating').value)   || 2,
        ptsFavorite: parseInt(document.getElementById('cfg-pts-favorite').value) || 1,
        maxScore:    parseInt(document.getElementById('cfg-max-score').value)    || 100
      };
      await db.collection('config').doc('score').set(newCfg);
      showToast('Configuração de score salva! ✅');
    };
  }

  return {
    initAdmin, deleteCategory, deleteAgeRating,
    resolveReport, toggleMovie, removeMovie
  };
})();
