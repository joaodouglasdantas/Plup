/**
 * PLUP — Filmes
 * Adicionar, buscar, avaliar, watchlist, favoritos, categorias
 */

const Movies = (() => {

  // ── Categorias ────────────────────────────
  function onCategories(callback) {
    return db.collection('categories').orderBy('name').onSnapshot(snap => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }

  async function addCategory(name, icon) {
    await db.collection('categories').add({
      name, icon: icon || '🎬',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  async function deleteCategory(id) {
    await db.collection('categories').doc(id).delete();
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

  // ── Adicionar filme ───────────────────────
  async function addMovie(data, coverFile) {
    const uid = Auth.getCurrentUser().uid;
    const userDoc = Auth.getUserDoc();
    let coverUrl = '';

    if (coverFile) {
      const ref = storage.ref(`covers/${Date.now()}_${coverFile.name}`);
      await ref.put(coverFile);
      coverUrl = await ref.getDownloadURL();
    }

    const docRef = await db.collection('movies').add({
      title:       data.title.trim(),
      description: data.description.trim(),
      categoryId:  data.categoryId,
      ageRatingId: data.ageRatingId,
      coverUrl,
      addedBy:     uid,
      addedByName: userDoc.name,
      addedByCoupleId: userDoc.coupleId || null,
      approved: true, // auto-aprovado; admin pode remover
      reportCount: 0,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Feed event
    if (userDoc.coupleId) {
      await _addFeedEvent(userDoc.coupleId, 'movie_added', {
        movieId: docRef.id,
        movieTitle: data.title.trim(),
        coverUrl
      });
    }

    return docRef.id;
  }

  // ── Listar filmes ─────────────────────────
  function onMovies(categoryId, callback) {
    let query = db.collection('movies').where('approved', '==', true).orderBy('createdAt', 'desc');
    if (categoryId && categoryId !== 'all') {
      query = query.where('categoryId', '==', categoryId);
    }
    return query.onSnapshot(snap => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
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
    const ratingId = `${coupleId}_${movieId}`;
    const exists = (await db.collection('ratings').doc(ratingId).get()).exists;

    await db.collection('ratings').doc(ratingId).set({
      coupleId, movieId, stars,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    if (!exists) {
      await Couple.recalcScore(coupleId);

      // Feed event
      const movieDoc = await getMovie(movieId);
      await _addFeedEvent(coupleId, 'rated', {
        movieId,
        movieTitle: movieDoc?.title || '',
        coverUrl: movieDoc?.coverUrl || '',
        stars
      });
    }
  }

  async function getRating(coupleId, movieId) {
    const snap = await db.collection('ratings').doc(`${coupleId}_${movieId}`).get();
    return snap.exists ? snap.data().stars : 0;
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

    // Remover da watchlist se estiver
    await removeFromWatchlist(coupleId, movieId);
    await Couple.recalcScore(coupleId);

    // Feed event
    const movieDoc = await getMovie(movieId);
    await _addFeedEvent(coupleId, 'watched', {
      movieId,
      movieTitle: movieDoc?.title || '',
      coverUrl: movieDoc?.coverUrl || ''
    });
  }

  async function isWatched(coupleId, movieId) {
    const snap = await db.collection('watched').doc(`${coupleId}_${movieId}`).get();
    return snap.exists;
  }

  async function getWatched(coupleId) {
    const snap = await db.collection('watched').where('coupleId', '==', coupleId)
      .orderBy('watchedAt', 'desc').get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  // ── Watchlist ─────────────────────────────
  async function addToWatchlist(coupleId, movieId) {
    const id = `${coupleId}_${movieId}`;
    const exists = (await db.collection('watchlist').doc(id).get()).exists;
    if (exists) { showToast('Já está na lista de "Ver depois" 📋'); return; }
    await db.collection('watchlist').doc(id).set({
      coupleId, movieId,
      addedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    showToast('Adicionado à lista "Ver depois" 📋');
  }

  async function removeFromWatchlist(coupleId, movieId) {
    await db.collection('watchlist').doc(`${coupleId}_${movieId}`).delete();
  }

  async function isInWatchlist(coupleId, movieId) {
    const snap = await db.collection('watchlist').doc(`${coupleId}_${movieId}`).get();
    return snap.exists;
  }

  async function getWatchlist(coupleId) {
    const snap = await db.collection('watchlist').where('coupleId', '==', coupleId)
      .orderBy('addedAt', 'desc').get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
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
    showToast('Adicionado aos favoritos ⭐');
    return true;
  }

  async function isInFavorites(coupleId, movieId) {
    const snap = await db.collection('favorites').doc(`${coupleId}_${movieId}`).get();
    return snap.exists;
  }

  async function getFavorites(coupleId) {
    const snap = await db.collection('favorites').where('coupleId', '==', coupleId)
      .orderBy('addedAt', 'desc').get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
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
    showToast('Denúncia enviada. Obrigado! 🙏');
  }

  // ── Feed event (interno) ──────────────────
  async function _addFeedEvent(coupleId, type, data) {
    await db.collection('feed').add({
      coupleId, type,
      ...data,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  // ── Admin: deletar filme ──────────────────
  async function deleteMovie(movieId) {
    await db.collection('movies').doc(movieId).delete();
  }

  // ── Admin: aprovar/reprovar ───────────────
  async function setApproved(movieId, approved) {
    await db.collection('movies').doc(movieId).update({ approved });
  }

  return {
    onCategories, addCategory, deleteCategory,
    onAgeRatings, addAgeRating, deleteAgeRating,
    addMovie, onMovies, searchMovies, getMovie,
    rateMovie, getRating,
    markWatched, isWatched, getWatched,
    addToWatchlist, removeFromWatchlist, isInWatchlist, getWatchlist,
    addToFavorites, isInFavorites, getFavorites,
    reportMovie, deleteMovie, setApproved
  };
})();
