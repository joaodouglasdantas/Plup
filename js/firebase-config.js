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
  apiKey:            "COLE_SUA_API_KEY_AQUI",
  authDomain:        "SEU_PROJETO.firebaseapp.com",
  projectId:         "SEU_PROJETO",
  storageBucket:     "SEU_PROJETO.appspot.com",
  messagingSenderId: "SEU_SENDER_ID",
  appId:             "SEU_APP_ID"
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);

// Instâncias globais
const auth = firebase.auth();
const db   = firebase.firestore();
const storage = firebase.storage();

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
