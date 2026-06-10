/**
 * PLUP — Firebase Configuration
 * ────────────────────────────────────────────
 * INSTRUÇÕES DE SETUP:
 * 1. Acesse https://console.firebase.google.com
 * 2. Crie um novo projeto chamado "plup"
 * 3. Adicione um app Web ao projeto
 * 4. Copie as credenciais abaixo substituindo os valores
 * 5. Ative: Authentication (Email/Password), Firestore, Storage
 * ────────────────────────────────────────────
 */

const firebaseConfig = {
  apiKey:            "AIzaSyAojH50NxiisbvaLEmSp2gd1y13ODzD5ns",
  authDomain:        "plup-a3d88.firebaseapp.com",
  projectId:         "plup-a3d88",
  storageBucket:     "plup-a3d88.firebasestorage.app",
  messagingSenderId: "574190070202",
  appId:             "1:574190070202:web:b2e6a5fbfa0f544a5f1583",
  measurementId:     "G-6SW91JBMSF"
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);

// Instâncias globais
const auth = firebase.auth();
const db   = firebase.firestore();
const storage = firebase.storage();

// ── TMDB API Key ──────────────────────────────────
// Obtenha sua chave gratuita em https://www.themoviedb.org/settings/api
// Substitua a string vazia pela sua chave para habilitar busca de filmes/séries/animes
const TMDB_API_KEY = '';

// Admin UIDs (adicione o UID do admin após criar a conta)
const ADMIN_UIDS = [
  // "COLE_O_UID_DO_ADMIN_AQUI"
];

// Configurações de score padrão (serão sobrescritas pelo Firestore)
const DEFAULT_SCORE_CONFIG = {
  ptsWatched:  5,
  ptsRating:   2,
  ptsFavorite: 1,
  maxScore:    100
};

// Persistência offline
db.enablePersistence({ synchronizeTabs: true }).catch(err => {
  if (err.code === 'failed-precondition') {
    console.warn('Persistência: múltiplas abas abertas');
  } else if (err.code === 'unimplemented') {
    console.warn('Persistência não suportada neste navegador');
  }
});
