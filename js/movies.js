/**
 * PLUP — Filmes
 * Adicionar, buscar, avaliar, watchlist, favoritos, categorias
 */

const Movies = (() => {

  // ── Helpers de notificação ────────────────
  async function _notifyPartner(coupleId, uid, data) {
    try {
      const couple = await Couple.getCoupleDoc(coupleId);
      if (!couple) return;
      const partnerUid = couple.user1 === uid ? couple.user2 : couple.user1;
      await db.collection('notifications').add({
        userId: partnerUid, read: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        ...data
      });
    } catch(e) { /* não crítico */ }
  }

  async function _notifyFollowers(coupleId, data) {
    try {
      const snap = await db.collection('follows').where('following', '==', coupleId).get();
      if (snap.empty) return;
      const batch = db.batch();
      for (const doc of snap.docs) {
        const fc = await Couple.getCoupleDoc(doc.data().follower);
        if (!fc) continue;
        for (const userId of [fc.user1, fc.user2]) {
          batch.set(db.collection('notifications').doc(), {
            userId, read: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            ...data
          });
        }
      }
      await batch.commit();
    } catch(e) { /* não crítico */ }
  }

  // ── Categorias ────────────────────────────
  function onCategories(callback) {
    return db.collection('categories').orderBy('name').onSnapshot(snap => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }

  async function addCategory(name, color) {
    await db.collection('categories').add({
      name, color: color || '',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  async function deleteCategory(id) {
    await db.collection('categories').doc(id).delete();
  }

  async function updateCategory(id, name, color) {
    await db.collection('categories').doc(id).update({ name, color });
  }

  // ── Classificações etárias ─────────────────
  function onAgeRatings(callback) {
    return db.collection('ageRatings').orderBy('order').onSnapshot(snap => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }

  async function addAgeRating(label, color, order) {
    const snap = await db.collection('ageRatings').orderBy('order','desc').limit(1).get();
    const nextOrder = snap.empty ? 0 : snap.docs[0].data().order + 1;
    await db.collection('ageRatings').add({
      label, color: color || '#0077B6',
      order: order !== undefined ? order : nextOrder,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  async function deleteAgeRating(id) {
    await db.collection('ageRatings').doc(id).delete();
  }

  async function updateAgeRating(id, label, color) {
    await db.collection('ageRatings').doc(id).update({ label, color });
  }

  // ── Adicionar filme ───────────────────────
  async function addMovie(data, coverFile, coverUrlFallback) {
    const uid = Auth.getCurrentUser().uid;
    const userDoc = Auth.getUserDoc();
    let coverUrl = coverUrlFallback || '';

    if (coverFile) {
      const ref = storage.ref(`covers/${Date.now()}_${coverFile.name}`);
      await ref.put(coverFile);
      coverUrl = await ref.getDownloadURL();
    }

    const docRef = await db.collection('movies').add({
      title:          data.title.trim(),
      description:    data.description.trim(),
      categoryIds:    data.categoryIds || [],
      ageRatingId:    data.ageRatingId,
      coverUrl,
      coverPosition:  data.coverPosition || '50% 50%',
      // Tipo de conteúdo
      type:           data.type || 'movie',       // 'movie' | 'series' | 'anime'
      tmdbId:         data.tmdbId || null,
      // Série / Anime com temporadas
      seasons:        data.seasons || null,        // [{number, name, episodes}]
      totalSeasons:   data.totalSeasons || null,
      // Anime sequencial
      animeFormat:    data.animeFormat || null,    // 'sequential' | 'seasons'
      totalEpisodes:  data.totalEpisodes || null,
      addedBy:     uid,
      addedByName: userDoc.name,
      addedByCoupleId: userDoc.coupleId || null,
      approved: true, // auto-aprovado; admin pode remover
      reportCount: 0,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Feed event + notificar seguidores
    if (userDoc.coupleId) {
      await _addFeedEvent(userDoc.coupleId, 'movie_added', {
        movieId: docRef.id,
        movieTitle: data.title.trim(),
        coverUrl
      });
      await _notifyFollowers(userDoc.coupleId, {
        type: 'new_movie',
        message: `${userDoc.name} adicionou o filme "${data.title.trim()}"`,
        movieId: docRef.id
      });
    }

    return docRef.id;
  }

  // ── Editar filme ──────────────────────────
  async function updateMovie(movieId, data, coverFile, coverUrlFallback) {
    const updates = {
      title:         data.title.trim(),
      description:   data.description.trim(),
      categoryIds:   data.categoryIds || [],
      ageRatingId:   data.ageRatingId,
      coverPosition: data.coverPosition || '50% 50%',
      // Tipo de conteúdo
      type:          data.type || 'movie',
      tmdbId:        data.tmdbId ?? null,
      seasons:       data.seasons ?? null,
      totalSeasons:  data.totalSeasons ?? null,
      animeFormat:   data.animeFormat ?? null,
      totalEpisodes: data.totalEpisodes ?? null,
      updatedAt:     firebase.firestore.FieldValue.serverTimestamp()
    };

    if (coverFile) {
      const ref = storage.ref(`covers/${Date.now()}_${coverFile.name}`);
      await ref.put(coverFile);
      updates.coverUrl = await ref.getDownloadURL();
    } else if (coverUrlFallback) {
      updates.coverUrl = coverUrlFallback;
    }

    await db.collection('movies').doc(movieId).update(updates);
  }

  // ── Listar filmes ─────────────────────────
  function onMovies(callback) {
    return db.collection('movies')
      .where('approved', '==', true)
      .onSnapshot(snap => {
        const movies = snap.docs.map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        callback(movies);
      });
  }

  async function searchMovies(text) {
    // Busca simples por título (Firestore não tem full-text nativo)
    const upper = text.charAt(0).toUpperCase() + text.slice(1);
    const snap = await db.collection('movies')
      .where('approved', '==', true)
      .orderBy('title')
      .startAt(upper)
      .endAt(upper + '')
      .limit(20)
      .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  async function getMovie(movieId) {
    const snap = await db.collection('movies').doc(movieId).get();
    if (!snap.exists) return null;
    return { id: snap.id, ...snap.data() };
  }

  // ── Avaliar filme ─────────────────────────
  async function rateMovie(coupleId, movieId, stars) {
    const uid = Auth.getCurrentUser().uid;
    const ratingId = `${coupleId}_${movieId}_${uid}`;

    await db.collection('ratings').doc(ratingId).set({
      coupleId, movieId, stars, userId: uid,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    await Couple.recalcScore(coupleId);

    // Verificar se o parceiro também já avaliou
    const coupleSnap = await db.collection('couples').doc(coupleId).get();
    const coupleData = coupleSnap.data();
    const partnerUid = coupleData.user1 === uid ? coupleData.user2 : coupleData.user1;
    const partnerSnap = await db.collection('ratings').doc(`${coupleId}_${movieId}_${partnerUid}`).get();
    const movieDoc = await getMovie(movieId);
    const name = Auth.getUserDoc()?.name || 'Parceiro(a)';

    if (partnerSnap.exists) {
      // Ambos avaliaram — remover evento anterior e publicar média atualizada
      const avg = Math.round((stars + partnerSnap.data().stars) * 10 / 2) / 10;

      // Deletar qualquer evento 'rated' existente para este casal+filme
      const oldEvents = await db.collection('feed')
        .where('coupleId', '==', coupleId)
        .where('type', '==', 'rated')
        .where('movieId', '==', movieId)
        .get();
      const batch = db.batch();
      oldEvents.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();

      // Criar único evento com a média atual
      await _addFeedEvent(coupleId, 'rated', {
        movieId, movieTitle: movieDoc?.title || '', coverUrl: movieDoc?.coverUrl || '',
        stars: avg
      });
      await _notifyPartner(coupleId, uid, {
        type: 'partner_rated',
        message: `Vocês dois avaliaram "${movieDoc?.title || 'um filme'}" — média: ${avg}★`,
        movieId
      });
    } else {
      // Apenas um avaliou — só notifica o parceiro pra avaliar
      await _notifyPartner(coupleId, uid, {
        type: 'partner_rated',
        message: `${name} avaliou "${movieDoc?.title || 'um filme'}" com ${stars}★ — avalie também!`,
        movieId
      });
    }
  }

  async function getRating(coupleId, movieId) {
    const uid = Auth.getCurrentUser().uid;
    const snap = await db.collection('ratings').doc(`${coupleId}_${movieId}_${uid}`).get();
    return snap.exists ? snap.data().stars : 0;
  }

  async function getPartnerRating(coupleId, movieId, partnerUid) {
    const snap = await db.collection('ratings').doc(`${coupleId}_${movieId}_${partnerUid}`).get();
    return snap.exists ? snap.data().stars : null;
  }

  // ── Marcar como assistido ─────────────────
  async function markWatched(coupleId, movieId) {
    const watchedId = `${coupleId}_${movieId}`;
    const exists = (await db.collection('watched').doc(watchedId).get()).exists;
    if (exists) return;

    await db.collection('watched').doc(watchedId).set({
      coupleId, movieId,
      watchedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Remover da watchlist e watching se estiver
    await removeFromWatchlist(coupleId, movieId);
    await removeFromWatching(coupleId, movieId);
    await Couple.recalcScore(coupleId);

    // Feed event + notificação ao parceiro
    const movieDoc = await getMovie(movieId);
    await _addFeedEvent(coupleId, 'watched', {
      movieId,
      movieTitle: movieDoc?.title || '',
      coverUrl: movieDoc?.coverUrl || ''
    });
    const uid2 = Auth.getCurrentUser().uid;
    const name2 = Auth.getUserDoc()?.name || 'Seu parceiro(a)';
    await _notifyPartner(coupleId, uid2, {
      type: 'partner_watched',
      message: `${name2} marcou "${movieDoc?.title || 'um filme'}" como assistido`,
      movieId
    });
  }

  async function removeFromWatched(coupleId, movieId) {
    await db.collection('watched').doc(`${coupleId}_${movieId}`).delete();
    await Couple.recalcScore(coupleId);
  }

  async function isWatched(coupleId, movieId) {
    const snap = await db.collection('watched').doc(`${coupleId}_${movieId}`).get();
    return snap.exists;
  }

  async function getWatched(coupleId) {
    const snap = await db.collection('watched').where('coupleId', '==', coupleId).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.watchedAt?.seconds || 0) - (a.watchedAt?.seconds || 0));
  }

  // ── Assistindo (watching) ─────────────────
  async function addToWatching(coupleId, movieId) {
    const id = `${coupleId}_${movieId}`;
    const exists = (await db.collection('watching').doc(id).get()).exists;
    if (exists) { showToast('Já está em "Assistindo"'); return; }

    await db.collection('watching').doc(id).set({
      coupleId, movieId,
      startedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Remover da watchlist se estiver lá
    await db.collection('watchlist').doc(id).delete();
    showToast('Marcado como Assistindo');

    // Notificar parceiro
    const uid = Auth.getCurrentUser().uid;
    const name = Auth.getUserDoc()?.name || 'Seu parceiro(a)';
    const movieDoc = await getMovie(movieId);
    await _notifyPartner(coupleId, uid, {
      type: 'partner_watching',
      message: `${name} começou a assistir "${movieDoc?.title || 'um conteúdo'}"`,
      movieId
    });
  }

  async function removeFromWatching(coupleId, movieId) {
    await db.collection('watching').doc(`${coupleId}_${movieId}`).delete();
  }

  async function isWatching(coupleId, movieId) {
    const snap = await db.collection('watching').doc(`${coupleId}_${movieId}`).get();
    return snap.exists;
  }

  async function getWatching(coupleId) {
    const snap = await db.collection('watching').where('coupleId', '==', coupleId).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.startedAt?.seconds || 0) - (a.startedAt?.seconds || 0));
  }

  // ── Watchlist ─────────────────────────────
  async function addToWatchlist(coupleId, movieId) {
    const id = `${coupleId}_${movieId}`;
    const exists = (await db.collection('watchlist').doc(id).get()).exists;
    if (exists) { showToast('Já está na lista "Ver depois"'); return; }
    await db.collection('watchlist').doc(id).set({
      coupleId, movieId,
      addedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    showToast('Adicionado à lista "Ver depois"');
  }

  async function removeFromWatchlist(coupleId, movieId) {
    await db.collection('watchlist').doc(`${coupleId}_${movieId}`).delete();
  }

  async function isInWatchlist(coupleId, movieId) {
    const snap = await db.collection('watchlist').doc(`${coupleId}_${movieId}`).get();
    return snap.exists;
  }

  async function getWatchlist(coupleId) {
    const snap = await db.collection('watchlist').where('coupleId', '==', coupleId).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.addedAt?.seconds || 0) - (a.addedAt?.seconds || 0));
  }

  // ── Favoritos ─────────────────────────────
  async function addToFavorites(coupleId, movieId) {
    const id = `${coupleId}_${movieId}`;
    const exists = (await db.collection('favorites').doc(id).get()).exists;
    if (exists) {
      await db.collection('favorites').doc(id).delete();
      await Couple.recalcScore(coupleId);
      showToast('Removido dos favoritos');
      return false;
    }
    await db.collection('favorites').doc(id).set({
      coupleId, movieId,
      addedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await Couple.recalcScore(coupleId);
    showToast('Adicionado aos favoritos');
    const uidFav = Auth.getCurrentUser().uid;
    const nameFav = Auth.getUserDoc()?.name || 'Seu parceiro(a)';
    const movieFav = await getMovie(movieId);
    await _notifyPartner(coupleId, uidFav, {
      type: 'partner_favorited',
      message: `${nameFav} adicionou "${movieFav?.title || 'um filme'}" aos favoritos`,
      movieId
    });
    return true;
  }

  async function isInFavorites(coupleId, movieId) {
    const snap = await db.collection('favorites').doc(`${coupleId}_${movieId}`).get();
    return snap.exists;
  }

  async function getFavorites(coupleId) {
    const snap = await db.collection('favorites').where('coupleId', '==', coupleId).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.addedAt?.seconds || 0) - (a.addedAt?.seconds || 0));
  }

  // ── Denunciar filme ───────────────────────
  async function reportMovie(movieId, reason, reporterUid) {
    await db.collection('reports').add({
      type: 'movie',
      targetId: movieId,
      reason,
      reportedBy: reporterUid,
      status: 'pending',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await db.collection('movies').doc(movieId).update({
      reportCount: firebase.firestore.FieldValue.increment(1)
    });
    showToast('Denúncia enviada. Obrigado!');
  }

  // ── Feed event (interno) ──────────────────
  async function _addFeedEvent(coupleId, type, data) {
    await db.collection('feed').add({
      coupleId, type,
      ...data,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  // ── Helper: deletar lote de docs (máx 500 por batch) ─
  async function _batchDelete(docs) {
    for (let i = 0; i < docs.length; i += 500) {
      const batch = db.batch();
      docs.slice(i, i + 500).forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
  }

  // ── Admin: deletar filme (cascade) ───────
  async function deleteMovie(movieId) {
    // Buscar doc para pegar coverUrl antes de deletar
    const movieSnap = await db.collection('movies').doc(movieId).get();
    const coverUrl = movieSnap.exists ? movieSnap.data().coverUrl : null;

    // Deletar em paralelo todas as coleções que referenciam movieId
    const collectionsWithMovieId = ['feed', 'watchlist', 'watching', 'favorites', 'watched', 'ratings', 'notifications'];
    await Promise.all(
      collectionsWithMovieId.map(col =>
        db.collection(col).where('movieId', '==', movieId).get()
          .then(snap => snap.empty ? null : _batchDelete(snap.docs))
      )
    );

    // Denúncias do filme
    const reportsSnap = await db.collection('reports').where('targetId', '==', movieId).get();
    if (!reportsSnap.empty) await _batchDelete(reportsSnap.docs);

    // Deletar documento do filme
    await db.collection('movies').doc(movieId).delete();

    // Deletar capa do Storage (best-effort)
    if (coverUrl) {
      try { await storage.refFromURL(coverUrl).delete(); } catch(_) {}
    }
  }

  // ── Admin: aprovar/reprovar ───────────────
  async function setApproved(movieId, approved) {
    await db.collection('movies').doc(movieId).update({ approved });
  }

  return {
    onCategories, addCategory, deleteCategory, updateCategory,
    onAgeRatings, addAgeRating, deleteAgeRating, updateAgeRating,
    addMovie, updateMovie, onMovies, searchMovies, getMovie,
    rateMovie, getRating, getPartnerRating,
    markWatched, removeFromWatched, isWatched, getWatched,
    addToWatching, removeFromWatching, isWatching, getWatching,
    addToWatchlist, removeFromWatchlist, isInWatchlist, getWatchlist,
    addToFavorites, isInFavorites, getFavorites,
    reportMovie, deleteMovie, setApproved
  };
})();
