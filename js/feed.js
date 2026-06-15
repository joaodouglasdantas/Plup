/**
 * PLUP — Feed Social
 * Timeline de atividades dos casais seguidos
 */

const Feed = (() => {

  // ── Carregar feed ─────────────────────────
  // Busca atividades dos casais que meu casal segue + meu próprio casal
  async function loadFeed(coupleId, limit = 30) {
    const followingIds = await Couple.getFollowing(coupleId);
    const allIds = [coupleId, ...followingIds];

    // Firestore suporta 'in' com até 10 valores; se tiver mais, paginar
    const chunks = [];
    for (let i = 0; i < allIds.length; i += 10) {
      chunks.push(allIds.slice(i, i + 10));
    }

    let events = [];
    for (const chunk of chunks) {
      const snap = await db.collection('feed')
        .where('coupleId', 'in', chunk)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();
      snap.docs.forEach(d => events.push({ id: d.id, ...d.data() }));
    }

    // Ordenar por data
    events.sort((a, b) => {
      const ta = a.createdAt?.toMillis?.() || 0;
      const tb = b.createdAt?.toMillis?.() || 0;
      return tb - ta;
    });

    return events.slice(0, limit);
  }

  // ── Realtime feed (próprio casal) ─────────
  function onOwnFeed(coupleId, callback) {
    return db.collection('feed')
      .where('coupleId', '==', coupleId)
      .orderBy('createdAt', 'desc')
      .limit(20)
      .onSnapshot(snap => {
        callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });
  }

  // ── Realtime feed (todos os casais seguidos) ──
  // Sem orderBy → sem índice composto necessário; ordena client-side
  function onFeed(coupleIds, callback) {
    const pool = {};  // id → evento
    const listeners = [];

    function emit() {
      const sorted = Object.values(pool)
        .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
        .slice(0, 30);
      callback(sorted);
    }

    const chunks = [];
    for (let i = 0; i < coupleIds.length; i += 10) chunks.push(coupleIds.slice(i, i + 10));

    for (const chunk of chunks) {
      const unsub = db.collection('feed')
        .where('coupleId', 'in', chunk)
        .onSnapshot(snap => {
          snap.docChanges().forEach(ch => {
            if (ch.type === 'removed') delete pool[ch.doc.id];
            else pool[ch.doc.id] = { id: ch.doc.id, ...ch.doc.data() };
          });
          emit();
        }, err => console.error('feed listener:', err));
      listeners.push(unsub);
    }

    return () => listeners.forEach(fn => fn());
  }

  // ── Renderizar card de feed ───────────────
  async function renderFeedCard(event, coupleDoc, categoriesMap, myCoupleId) {
    const card = document.createElement('div');
    card.className = 'feed-card';

    // Buscar nomes dos membros do casal
    const [u1, u2] = await Promise.all([
      Auth.fetchUserDoc(coupleDoc.user1),
      Auth.fetchUserDoc(coupleDoc.user2)
    ]);

    const names = `${u1?.name || '?'} & ${u2?.name || '?'}`;
    const time = _timeAgo(event.createdAt?.toDate?.());

    let actionText = '';
    let starsHtml  = '';

    const typeLabel = { movie: 'filme', series: 'série', anime: 'anime' }[event.movieType] || 'filme';
    const typeIcon  = { movie: 'fa-film', series: 'fa-tv', anime: 'fa-star' }[event.movieType] || 'fa-film';
    const artigo    = typeLabel === 'série' ? 'uma série' : typeLabel === 'anime' ? 'um anime' : 'um filme';

    switch (event.type) {
      case 'watching':
        actionText = `<i class="fa-solid fa-play"></i> está assistindo ${artigo}!`;
        break;
      case 'watched':
        actionText = `<i class="fa-solid fa-check"></i> terminou de assistir ${artigo}!`;
        break;
      case 'favorited':
        actionText = `<i class="fa-solid fa-heart"></i> adicionou ${artigo} aos favoritos!`;
        break;
      case 'rated':
        actionText = `<i class="fa-solid fa-star"></i> média do casal: <strong>${event.stars} <i class="fa-solid fa-star" style="font-size:.8em"></i></strong>`;
        starsHtml  = `<div class="feed-card-stars">${_renderStars(event.stars)}</div>`;
        break;
      case 'movie_added':
        actionText = `<i class="fa-solid ${typeIcon}"></i> adicionou ${artigo} à plataforma!`;
        break;
      default:
        actionText = '<i class="fa-solid fa-circle-dot"></i> nova atividade';
    }

    const coverHtml = event.coverUrl
      ? `<img class="feed-card-cover" src="${event.coverUrl}" alt="${event.movieTitle}" loading="lazy" />`
      : `<div class="feed-card-cover movie-card-cover"></div>`;

    const isOwn = myCoupleId && event.coupleId === myCoupleId;
    const deleteBtn = isOwn
      ? `<button class="feed-card-delete-btn" title="Excluir post"><i class="fa-solid fa-trash"></i></button>`
      : '';

    card.innerHTML = `
      <div class="feed-card-header">
        <div class="feed-couple-avatars">
          <div class="avatar">${u1?.avatarUrl ? `<img src="${u1.avatarUrl}" alt="">` : '<i class="fa-solid fa-user"></i>'}</div>
          <div class="avatar">${u2?.avatarUrl ? `<img src="${u2.avatarUrl}" alt="">` : '<i class="fa-solid fa-user"></i>'}</div>
        </div>
        <div class="feed-card-couple">
          <div class="feed-card-couple-name">${names}</div>
          <div class="feed-card-time">${time}</div>
        </div>
        ${deleteBtn}
      </div>
      ${coverHtml}
      <div class="feed-card-body">
        <div class="feed-card-title">${event.movieTitle || ''}</div>
        <div class="feed-card-action">${actionText}</div>
        ${starsHtml}
      </div>
    `;

    if (isOwn) {
      card.querySelector('.feed-card-delete-btn').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm('Excluir este post do feed?')) return;
        await db.collection('feed').doc(event.id).delete();
      });
    }

    if (event.movieId) {
      card.style.cursor = 'pointer';
      card.addEventListener('click', () => {
        window._app?.openMovieDetail?.(event.movieId);
      });
    }

    return card;
  }

  // ── Render estrelas ───────────────────────
  function _renderStars(val) {
    let h = '';
    for (let i = 1; i <= 5; i++) {
      h += `<i class="fa-${i <= val ? 'solid' : 'regular'} fa-star${i > val ? ' empty' : ''}"></i>`;
    }
    return h;
  }

  // ── Time ago ──────────────────────────────
  function _timeAgo(date) {
    if (!date) return '';
    const diff = (Date.now() - date.getTime()) / 1000;
    if (diff < 60)   return 'agora mesmo';
    if (diff < 3600) return `${Math.floor(diff/60)} min atrás`;
    if (diff < 86400)return `${Math.floor(diff/3600)}h atrás`;
    return `${Math.floor(diff/86400)}d atrás`;
  }

  // ── Notificações ─────────────────────────
  function onNotifications(uid, callback) {
    return db.collection('notifications')
      .where('userId', '==', uid)
      .onSnapshot(snap => {
        const notifs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
          .slice(0, 30);
        callback(notifs);
      });
  }

  async function markNotifRead(notifId) {
    await db.collection('notifications').doc(notifId).update({ read: true });
  }

  async function markAllNotifsRead(uid) {
    const snap = await db.collection('notifications')
      .where('userId', '==', uid)
      .where('read', '==', false)
      .get();
    const batch = db.batch();
    snap.docs.forEach(d => batch.update(d.ref, { read: true }));
    await batch.commit();
  }

  // ── Feed do admin — todos os posts, sem filtro de casal ──
  function onAdminFeed(callback) {
    return db.collection('feed')
      .orderBy('createdAt', 'desc')
      .limit(50)
      .onSnapshot(snap => {
        const events = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        callback(events);
      }, err => console.error('admin feed:', err));
  }

  return {
    loadFeed, onOwnFeed, onFeed, onAdminFeed, renderFeedCard,
    onNotifications, markNotifRead, markAllNotifsRead
  };
})();
