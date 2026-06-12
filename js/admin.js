/**
 * PLUP — Painel Admin
 * Gerenciar categorias, idades, denúncias, filmes, score config
 */

const Admin = (() => {

  // ── Render painel completo ─────────────────
  function initAdmin() {
    if (!Auth.isAdmin()) {
      showToast('Acesso restrito');
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
          <div class="admin-item" id="cat-item-${c.id}">
            ${badge}
            <span class="admin-item-name">${c.name}</span>
            <button class="admin-item-edit" onclick="Admin.editCategory('${c.id}','${c.name.replace(/'/g,"\\'")}','${c.color || ''}')"><i class="fa-solid fa-pen"></i></button>
            <button class="admin-item-delete" data-id="${c.id}" onclick="Admin.deleteCategory('${c.id}')"><i class="fa-solid fa-trash"></i></button>
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
        showToast('Categoria adicionada!');
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
        <div class="admin-item" id="age-item-${a.id}">
          <span class="badge-age" style="background:${a.color || '#FFB703'};color:#fff">${a.label}</span>
          <span class="admin-item-name">${a.label}</span>
          <button class="admin-item-edit" onclick="Admin.editAgeRating('${a.id}','${a.label.replace(/'/g,"\\'")}','${a.color || ''}')"><i class="fa-solid fa-pen"></i></button>
          <button class="admin-item-delete" onclick="Admin.deleteAgeRating('${a.id}')"><i class="fa-solid fa-trash"></i></button>
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
        showToast('Classificação adicionada!');
      } catch(e) { showToast(e.message); }
    };
  }

  async function deleteAgeRating(id) {
    if (!confirm('Deletar esta classificação?')) return;
    await Movies.deleteAgeRating(id);
    showToast('Classificação removida');
  }

  function editCategory(id, name, color) {
    const item = document.getElementById(`cat-item-${id}`);
    item.innerHTML = `
      <input class="admin-edit-input" id="edit-cat-name-${id}" value="${name}" placeholder="Nome" />
      <input type="color" class="admin-edit-color" id="edit-cat-color-${id}" value="${color || '#0077B6'}" />
      <button class="btn btn-primary btn-sm" onclick="Admin.saveCategory('${id}')">Salvar</button>
      <button class="btn btn-ghost btn-sm" onclick="Admin.cancelEdit('cat-item-${id}')">✕</button>
    `;
  }

  async function saveCategory(id) {
    const name = document.getElementById(`edit-cat-name-${id}`).value.trim();
    const color = document.getElementById(`edit-cat-color-${id}`).value;
    if (!name) { showToast('Digite o nome'); return; }
    await Movies.updateCategory(id, name, color);
    showToast('Categoria atualizada');
  }

  function editAgeRating(id, label, color) {
    const item = document.getElementById(`age-item-${id}`);
    item.innerHTML = `
      <input class="admin-edit-input" id="edit-age-label-${id}" value="${label}" placeholder="Rótulo" />
      <input type="color" class="admin-edit-color" id="edit-age-color-${id}" value="${color || '#FFB703'}" />
      <button class="btn btn-primary btn-sm" onclick="Admin.saveAgeRating('${id}')">Salvar</button>
      <button class="btn btn-ghost btn-sm" onclick="Admin.cancelEdit('age-item-${id}')">✕</button>
    `;
  }

  async function saveAgeRating(id) {
    const label = document.getElementById(`edit-age-label-${id}`).value.trim();
    const color = document.getElementById(`edit-age-color-${id}`).value;
    if (!label) { showToast('Digite o rótulo'); return; }
    await Movies.updateAgeRating(id, label, color);
    showToast('Classificação atualizada');
  }

  function cancelEdit(itemId) {
    // o listener do Firestore já vai re-renderizar o item automaticamente
    // mas forçamos um no-op para fechar o form imediatamente
    const item = document.getElementById(itemId);
    if (item) item.innerHTML = '<span style="color:var(--gray-5);font-size:.8rem">Atualizando...</span>';
  }

  // ── Denúncias ─────────────────────────────
  function loadReports() {
    db.collection('reports').where('status', '==', 'pending')
      .onSnapshot(async snap => {
        const list = document.getElementById('reports-list');
        if (snap.empty) {
          list.innerHTML = '<p class="empty-text">Nenhuma denúncia pendente</p>';
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
              ${m.coverUrl ? `<img src="${m.coverUrl}" style="width:36px;height:50px;object-fit:cover;border-radius:6px;" />` : '<i class="fa-solid fa-film" style="font-size:1.4rem;color:var(--gray-5)"></i>'}
              <span class="admin-item-name">${m.title}</span>
              <span style="font-size:.7rem;padding:3px 8px;background:${m.approved?'var(--cyan-l)':'#FFE4E1'};border-radius:100px;color:var(--navy)">
                ${m.approved ? 'ativo' : 'oculto'}
              </span>
              <button class="admin-item-delete" onclick="Admin.toggleMovie('${m.id}',${m.approved})">
                ${m.approved ? '<i class="fa-solid fa-ban"></i>' : '<i class="fa-solid fa-check"></i>'}
              </button>
              <button class="admin-item-delete" onclick="Admin.removeMovie('${m.id}')"><i class="fa-solid fa-trash"></i></button>
            </div>
          `;
        }).join('');
      });
  }

  async function toggleMovie(movieId, current) {
    await Movies.setApproved(movieId, !current);
    showToast(!current ? 'Filme reativado' : 'Filme ocultado');
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
      showToast('Configuração de score salva!');
    };

    document.getElementById('btn-clear-old-feed').onclick = async () => {
      if (!confirm('Remover todos os posts do feed com mais de 30 dias? Esta ação não pode ser desfeita.')) return;
      showLoading(true);
      try {
        const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const snap = await db.collection('feed')
          .where('createdAt', '<', firebase.firestore.Timestamp.fromDate(cutoff))
          .get();
        if (snap.empty) { showToast('Nenhum post antigo encontrado'); return; }
        // Batch suporta até 500 operações
        const chunks = [];
        for (let i = 0; i < snap.docs.length; i += 500) chunks.push(snap.docs.slice(i, i + 500));
        for (const chunk of chunks) {
          const batch = db.batch();
          chunk.forEach(doc => batch.delete(doc.ref));
          await batch.commit();
        }
        showToast(`${snap.size} post(s) removido(s)`);
      } catch(e) { showToast('Erro: ' + e.message); }
      finally { showLoading(false); }
    };

    document.getElementById('btn-clear-old-ratings').onclick = async () => {
      if (!confirm('Deletar todos os eventos de avaliação individual do feed? Esta ação não pode ser desfeita.')) return;
      showLoading(true);
      try {
        const allRated = await db.collection('feed').where('type', '==', 'rated').get();
        const snap = { docs: allRated.docs.filter(d => d.data().userId), size: 0 };
        snap.size = snap.docs.length;
        if (snap.empty) { showToast('Nenhum evento antigo encontrado'); return; }
        const chunks = [];
        for (let i = 0; i < snap.docs.length; i += 500) chunks.push(snap.docs.slice(i, i + 500));
        for (const chunk of chunks) {
          const batch = db.batch();
          chunk.forEach(doc => batch.delete(doc.ref));
          await batch.commit();
        }
        showToast(`${snap.size} evento(s) removido(s)`);
      } catch(e) { showToast('Erro: ' + e.message); }
      finally { showLoading(false); }
    };

    document.getElementById('btn-nuke-feed').onclick = async () => {
      if (!confirm('Isso vai apagar TODOS os posts do feed de todos os casais.\n\nTem certeza absoluta?')) return;
      if (!confirm('Última chance. Esta ação é irreversível.')) return;
      showLoading(true);
      try {
        let total = 0;
        // Firestore não permite query sem filtro em batch, então usamos get() e deletamos em chunks
        let snap = await db.collection('feed').limit(500).get();
        while (!snap.empty) {
          const batch = db.batch();
          snap.docs.forEach(doc => batch.delete(doc.ref));
          await batch.commit();
          total += snap.size;
          if (snap.size < 500) break;
          snap = await db.collection('feed').limit(500).get();
        }
        showToast(`Feed limpo. ${total} post(s) removido(s).`);
      } catch(e) { showToast('Erro: ' + e.message); }
      finally { showLoading(false); }
    };
  }

  return {
    initAdmin,
    deleteCategory, editCategory, saveCategory,
    deleteAgeRating, editAgeRating, saveAgeRating,
    cancelEdit,
    resolveReport, toggleMovie, removeMovie
  };
})();
