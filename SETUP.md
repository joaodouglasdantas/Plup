# Plup — Guia de Setup Firebase

## 1. Criar projeto Firebase

1. Acesse https://console.firebase.google.com
2. Clique em **"Criar um projeto"**
3. Nome: `plup` (ou o nome que quiser)
4. Desative o Google Analytics (opcional)
5. Clique em **Criar projeto**

## 2. Registrar o app Web

1. No painel do projeto, clique no ícone `</>`(Web)
2. Apelido: `plup-web`
3. Clique em **Registrar app**
4. Copie o objeto `firebaseConfig` que aparecer

## 3. Configurar credenciais

Abra `js/firebase-config.js` e substitua os valores:

```js
const firebaseConfig = {
  apiKey:            "SUA_API_KEY",
  authDomain:        "SEU_PROJETO.firebaseapp.com",
  projectId:         "SEU_PROJETO",
  storageBucket:     "SEU_PROJETO.appspot.com",
  messagingSenderId: "SEU_SENDER_ID",
  appId:             "SEU_APP_ID"
};
```

## 4. Ativar Authentication

1. Menu esquerdo → **Authentication** → **Começar**
2. Aba **Sign-in method**
3. Ative **E-mail/senha**

## 5. Criar banco Firestore

1. Menu esquerdo → **Firestore Database** → **Criar banco de dados**
2. Escolha **Modo de produção**
3. Selecione a região mais próxima (ex: `southamerica-east1`)

## 6. Importar regras de segurança

1. No Firestore, aba **Regras**
2. Cole o conteúdo do arquivo `firestore.rules`
3. Clique em **Publicar**

## 7. Ativar Storage (para fotos e capas)

1. Menu esquerdo → **Storage** → **Começar**
2. Modo de produção
3. Na aba **Regras**, substitua por:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /avatars/{uid} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == uid;
    }
    match /covers/{filename} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }
  }
}
```

## 8. Configurar admin

1. Abra o Plup no navegador e **crie uma conta**
2. No Firebase Console → Firestore → coleção `users` → seu documento
3. Adicione o campo: `isAdmin: true`
4. Pronto! Você verá o menu Admin no app

## 9. Dados iniciais recomendados

No admin do Plup, cadastre categorias como:
- 🎭 Drama
- 😂 Comédia
- 😱 Terror
- 💕 Romance
- 🚀 Ficção Científica
- 🎬 Ação
- 🗺️ Aventura
- 📺 Documentário

E classificações etárias:
- Livre (#2EC4B6)
- 10+ (#FFB703)
- 12+ (#FF9500)
- 14+ (#FF6B35)
- 16+ (#E63946)
- 18+ (#9D0208)

## 10. Hospedar o app (opcional)

```bash
npm install -g firebase-tools
firebase login
firebase init hosting
firebase deploy
```

Ou simplesmente sirva com qualquer servidor HTTP estático.

---
💙 **Dúvidas?** O sistema foi construído com Firebase v10 compat + vanilla JS.
