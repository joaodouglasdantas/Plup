/**
 * PLUP — Lógica de Casais
 * Conexão, perfil compartilhado, score, seguir/deixar de seguir
 */

const Couple = (() => {

  // ── Buscar usuário por nickname ou ID ─────
  async function searchUser(query) {
    query = query.trim();
    let snap;

    // Tentar por UID direto
    const byId = await db.collection('users').doc(query).get();
    if (byId.exists) return { id: byId.id, ...byId.data() };

    // Tentar por nickname
    const nick = query.startsWith('@') ? query.slice(1).toLowerCase() : query.toLowerCase();
    snap = await db.collection('users').where('nickname', '==', nick).limit(1).get();
    if (!snap.empty) return { id: snap.docs[0].id, ...snap.docs[0].data() };

    return null;
  }

  // ── Enviar convite ────────────────────────
  async function sendInvite(fromUid, toUid) {
    if (fromUid === toUid) throw new Error('Você não pode se conectar consigo mesmo 😅');

    const toUser = await Auth.fetchUserDoc(toUid);
    if (!toUser) throw new Error('Usuário não encontrado.');
    if (toUser.coupleId) throw new Error('Este usuário já está em um casal.');

    const fromUser = await Auth.fetchUserDoc(fromUid);
    if (fromUser.coupleId) throw new Error('Você já está em um casal.');

    // Verificar se já tem convite pendente
    const existing = await db.collection('invites')
      .where('from', '==', fromUid)
      .where('to', '==', toUid)
      .where('status', '==', 'pending')
      .get();
    if (!existing.empty) throw new Error('Convite já enviado! Aguarde a resposta.');

    await db.collection('invites').add({
      from: fromUid,
      fromName: fromUser.name,
      fromNickname: fromUser.nickname,
      fromAvatar: fromUser.avatarUrl || '',
      to: toUid,
      status: 'pending',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    await db.collection('users').doc(fromUid).update({ pendingInviteSent: toUid });
  }

  // ── Cancelar convite ──────────────────────
  async function cancelInvite(fromUid) {
    const snap = await db.collection('invites')
      .where('from', '==', fromUid)
      .where('status', '==', 'pending')
      .get();
    const batch = db.batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    batch.update(db.collection('users').doc(fromUid), { pendingInviteSent: null });
    await batch.commit();
  }

  // ── Aceitar convite ───────────────────────
  async function acceptInvite(inviteId, inviteData) {
    const myUid  = Auth.getCurrentUser().uid;
    const fromUid = inviteData.from;

    const coupleId = [myUid, fromUid].sort().join('_');

    const batch = db.batch();

    // Criar perfil do casal
    batch.set(db.collection('couples').doc(coupleId), {
      id: coupleId,
      user1: myUid,
      user2: fromUid,
      score: 0,
      moviesWatched: 0,
      favoritesCount: 0,
      followersCount: 0,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Atualizar ambos os usuários
    batch.update(db.collection('users').doc(myUid),   { coupleId, pendingInviteSent: null });
    batch.update(db.collection('users').doc(fromUid), { coupleId, pendingInviteSent: null });

    // Fechar convite
    batch.update(db.collection('invites').doc(inviteId), { status: 'accepted' });

    // Notificação para quem enviou
    batch.set(db.collection('notifications').doc(), {
      userId: fromUid,
      type: 'invite_accepted',
      message: `${Auth.getUserDoc().name} aceitou seu convite! 💙 Vocês são um casal agora!`,
      read: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    await batch.commit();
    return coupleId;
  }

  // ── Recusar convite ────────────────────────
  async function declineInvite(inviteId) {
    await db.collection('invites').doc(inviteId).update({ status: 'declined' });
  }

  // ── Obter convites recebidos ──────────────
  function onInvitesReceived(uid, callback) {
    return db.collection('invites')
      .where('to', '==', uid)
      .where('status', '==', 'pending')
      .onSnapshot(snap => {
        const invites = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        callback(invites);
      });
  }

  // ── Verificar convite pendente enviado ────
  async function checkPendingInvite(uid) {
    const userDoc = await Auth.fetchUserDoc(uid);
    if (!userDoc.pendingInviteSent) return null;
    const snap = await db.collection('invites')
      .where('from', '==', uid)
      .where('status', '==', 'pending')
      .get();
    return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
  }

  // ── Obter dados do casal ──────────────────
  async function getCoupleDoc(coupleId) {
    const snap = await db.collection('couples').doc(coupleId).get();
    if (!snap.exists) return null;
    return { id: snap.id, ...snap.data() };
  }

  function onCoupleDoc(coupleId, callback) {
    return db.collection('couples').doc(coupleId).onSnapshot(snap => {
      if (snap.exists) callback({ id: snap.id, ...snap.data() });
    });
  }

  // ── Recalcular score do casal ─────────────
  async function recalcScore(coupleId) {
    const cfg = await getScoreConfig();

    const [watchedSnap, ratingsSnap, favSnap] = await Promise.all([
      db.collection('watched').where('coupleId', '==', coupleId).get(),
      db.collection('ratings').where('coupleId', '==', coupleId).get(),
      db.collection('favorites').where('coupleId', '==', coupleId).get()
    ]);

    const raw = (watchedSnap.size * cfg.ptsWatched)
              + (ratingsSnap.size * cfg.ptsRating)
              + (favSnap.size     * cfg.ptsFavorite);

    const score = Math.min(raw, cfg.maxScore);
    const pct   = Math.round((score / cfg.maxScore) * 100);

    await db.collection('couples').doc(coupleId).update({
      score,
      scorePct: pct,
      moviesWatched: watchedSnap.size,
      favoritesCount: favSnap.size
    });

    return score;
  }

  // ── Config de score ───────────────────────
  async function getScoreConfig() {
    const snap = await db.collection('config').doc('score').get();
    return snap.exists ? snap.data() : DEFAULT_SCORE_CONFIG;
  }

  // ── Seguir casal ──────────────────────────
  async function followCouple(myCouple, targetCouple) {
    const followId = `${myCouple}_${targetCouple}`;
    await db.collection('follows').doc(followId).set({
      follower: myCouple,
      following: targetCouple,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await db.collection('couples').doc(targetCouple).update({
      followersCount: firebase.firestore.FieldValue.increment(1)
    });
  }

  // ── Deixar de seguir ─────────────────────
  async function unfollowCouple(myCouple, targetCouple) {
    const followId = `${myCouple}_${targetCouple}`;
    await db.collection('follows').doc(followId).delete();
    await db.collection('couples').doc(targetCouple).update({
      followersCount: firebase.firestore.FieldValue.increment(-1)
    });
  }

  // ── Verificar se segue ────────────────────
  async function isFollowing(myCouple, targetCouple) {
    const doc = await db.collection('follows').doc(`${myCouple}_${targetCouple}`).get();
    return doc.exists;
  }

  // ── Casais que eu sigo ────────────────────
  async function getFollowing(myCouple) {
    const snap = await db.collection('follows').where('follower', '==', myCouple).get();
    return snap.docs.map(d => d.data().following);
  }

  // ── Desconectar parceiro ──────────────────
  async function disconnect(coupleId, uid1, uid2) {
    const batch = db.batch();
    batch.update(db.collection('users').doc(uid1), { coupleId: null });
    batch.update(db.collection('users').doc(uid2), { coupleId: null });
    batch.delete(db.collection('couples').doc(coupleId));
    await batch.commit();
  }

  // ── Listar todos os casais (discover) ─────
  async function listCouples(limit = 20) {
    const snap = await db.collection('couples')
      .orderBy('score', 'desc')
      .limit(limit)
      .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  // ── Buscar casal por nickname de um membro ─
  async function searchCoupleByNickname(query) {
    query = query.toLowerCase().replace('@','');
    const snap = await db.collection('users')
      .where('nickname', '==', query).limit(1).get();
    if (snap.empty) return [];
    const user = snap.docs[0].data();
    if (!user.coupleId) return [];
    const coupleDoc = await getCoupleDoc(user.coupleId);
    return coupleDoc ? [coupleDoc] : [];
  }

  return {
    searchUser, sendInvite, cancelInvite, acceptInvite, declineInvite,
    onInvitesReceived, checkPendingInvite,
    getCoupleDoc, onCoupleDoc, recalcScore, getScoreConfig,
    followCouple, unfollowCouple, isFollowing, getFollowing,
    disconnect, listCouples, searchCoupleByNickname
  };
})();
