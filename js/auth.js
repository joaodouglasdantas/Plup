/**
 * PLUP — Autenticação
 * Login, cadastro, perfil de usuário
 */

const Auth = (() => {

  let currentUser = null;
  let userDoc = null;

  // ── Cadastro ─────────────────────────────
  async function register(name, nickname, email, password) {
    // Verificar se nickname já existe
    nickname = nickname.toLowerCase().replace(/[^a-z0-9_]/g, '');
    const nickQuery = await db.collection('users')
      .where('nickname', '==', nickname).get();
    if (!nickQuery.empty) throw new Error('Este @nickname já está em uso. Escolha outro.');

    const cred = await auth.createUserWithEmailAndPassword(email, password);
    const uid = cred.user.uid;

    await db.collection('users').doc(uid).set({
      uid,
      name,
      nickname,
      email,
      avatarUrl: '',
      coupleId: null,
      pendingInviteSent: null,
      isAdmin: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    await cred.user.updateProfile({ displayName: name });
    return cred.user;
  }

  // ── Login ─────────────────────────────────
  async function login(email, password) {
    const cred = await auth.signInWithEmailAndPassword(email, password);
    return cred.user;
  }

  // ── Logout ────────────────────────────────
  async function logout() {
    await auth.signOut();
  }

  // ── Reset de senha ─────────────────────────
  async function resetPassword(email) {
    await auth.sendPasswordResetEmail(email);
  }

  // ── Obter dados do usuário ────────────────
  async function fetchUserDoc(uid) {
    const snap = await db.collection('users').doc(uid).get();
    if (!snap.exists) return null;
    return { id: snap.id, ...snap.data() };
  }

  // ── Atualizar perfil ─────────────────────
  async function updateProfile(uid, data) {
    await db.collection('users').doc(uid).update(data);
    if (data.name) {
      await auth.currentUser.updateProfile({ displayName: data.name });
    }
  }

  // ── Upload avatar ─────────────────────────
  async function uploadAvatar(uid, file) {
    const ref = storage.ref(`avatars/${uid}`);
    await ref.put(file);
    const url = await ref.getDownloadURL();
    await db.collection('users').doc(uid).update({ avatarUrl: url });
    return url;
  }

  // ── Observer de auth ──────────────────────
  function onAuthChange(callback) {
    return auth.onAuthStateChanged(async (user) => {
      currentUser = user;
      if (user) {
        userDoc = await fetchUserDoc(user.uid);
      } else {
        userDoc = null;
      }
      callback(user, userDoc);
    });
  }

  // ── Getters ───────────────────────────────
  function getCurrentUser() { return currentUser; }
  function getUserDoc()     { return userDoc; }
  function isAdmin()        { return userDoc?.isAdmin || ADMIN_UIDS.includes(currentUser?.uid); }

  return { register, login, logout, resetPassword, fetchUserDoc, updateProfile, uploadAvatar, onAuthChange, getCurrentUser, getUserDoc, isAdmin };
})();
