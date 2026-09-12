# Caju OS — APK Android

Shell Android do Caju OS. Igual ao app desktop (Tauri), ele não empacota o
frontend: abre `https://operacoes.cajutech.net` num WebView. Ou seja, o APK
sempre mostra a versão que está em produção, sem precisar de novo build a cada
deploy.

## O que o shell resolve

- Upload de foto pelo `<input type="file">`, incluindo captura direto da câmera
  (fluxo de evidência).
- Permissões de câmera, microfone (voz/WebRTC) e geolocalização repassadas do
  WebView para o Android.
- Vídeo/chamada em tela cheia (`onShowCustomView`).
- Botão voltar navega no histórico do app; puxar para baixo recarrega.
- Link externo (`tel:`, `mailto:`, outro domínio) abre no app do sistema.
- Tela de "sem conexão" com botão de tentar de novo.

## Build

Precisa de JDK 17 e do Android SDK (platform 35, build-tools 35.0.0):

```bash
cd android
echo "sdk.dir=/caminho/do/android-sdk" > local.properties
./gradlew assembleRelease
```

O APK sai em `app/build/outputs/apk/release/app-release.apk`.

O build de release é assinado com a **chave de debug** — serve para instalar e
testar no celular, não para publicar na Play Store. Para publicar, crie uma
keystore de release e troque o `signingConfig` em `app/build.gradle.kts`.
Nunca commite a keystore.

Pelo CI: workflow `APK Android` (`.github/workflows/android-apk.yml`), execução
manual em Actions; o APK fica como artifact `caju-os-apk`.

## Instalar no celular

1. Baixe o `app-release.apk` no aparelho.
2. Autorize "instalar apps de fontes desconhecidas" para o app que abriu o
   arquivo (navegador/gerenciador de arquivos).
3. Instale e abra. Faça login normalmente, como no navegador.

Se já existir o app instalado com outra assinatura, desinstale antes — o Android
recusa a atualização quando a assinatura muda.

## Limites conhecidos

- Sem push nativo: notificação depende da aba aberta (Web Notifications no
  WebView do Android não dispara com o app fechado).
- Sem modo offline: sem internet o app mostra a tela de erro.
- `versionCode` fixo em 1 — suba a cada APK novo distribuído.
