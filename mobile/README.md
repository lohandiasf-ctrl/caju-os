# Caju OS — app nativo (Android/iOS)

App React Native (Expo) do Caju OS. **Não é WebView**: cada tela é nativa e
consome as mesmas rotas de API do Cloudflare Workers que o site usa, com o
mesmo login do Firebase (projeto `caju-websys`). A web continua sendo a
referência funcional — quando as duas divergirem, a web manda.

## Arquitetura

```
mobile/
  app/                    rotas (expo-router)
    login.tsx             entrar / recuperar senha
    (app)/index.tsx       Operação: kanban das 5 etapas + métricas + alertas SLA
    (app)/central-n1.tsx  fila N1, carga por atendente, assumir chamado
    (app)/spares.tsx      peças, rastreio e status de entrega
    (app)/financeiro.tsx  faturamento, repasses e margem por técnico
    (app)/mapa.tsx        cobertura de técnicos por cidade
    (app)/perfil.tsx      conta, trocar senha, sair
    (app)/chamado/[key]   detalhe do chamado + evidência pela câmera
  src/
    api/client.ts         fetch com ID token do Firebase no Authorization
    api/hooks.ts          busca com recarga e pull-to-refresh
    api/types.ts          tipos espelhados de lib/server/jira.ts e app/page.tsx
    auth/context.tsx      sessão + perfil (/api/auth/me)
    domain/tickets.ts     classificação de status e formatação (porte da web)
    domain/permissions.ts mesmas regras de lib/permissions.ts
    ui/kit.tsx            componentes compartilhados
    theme.ts              paleta alinhada ao tema da web
```

Nenhum endpoint novo foi criado: o app é mais um cliente das 44 rotas
existentes. Papel do usuário (`gerencia`, `n1`, ...) decide quais abas
aparecem, com as mesmas regras da web.

## Build do APK

Precisa de Node 22, JDK 17 e Android SDK (platform 35, build-tools 35.0.0):

```bash
cd mobile
npm install
npx expo prebuild --platform android          # gera mobile/android (não versionado)
./android/gradlew -p android assembleRelease -PreactNativeArchitectures=arm64-v8a
```

APK em `mobile/android/app/build/outputs/apk/release/app-release.apk`.

`arm64-v8a` cobre praticamente todo celular atual e deixa o APK ~4x menor.
Para um APK universal, rode sem o `-PreactNativeArchitectures`.

Pelo CI: workflow `APK Android`, execução manual em Actions, artifact
`caju-os-apk`.

## Desenvolvimento

```bash
cd mobile
npx expo start        # abra no Expo Go ou num dev build
npx tsc --noEmit      # obrigatório antes de commitar
```

`mobile/android/` é gerado pelo prebuild e está no `.gitignore` — não edite
nada lá; configuração nativa vai em `app.json`.

## Assinatura

O release está assinado com a **chave de debug** que o Expo gera: serve para
instalar e testar, não para publicar. Para a Play Store, crie uma keystore de
release, guarde fora do Git e ajuste `signingConfigs` no
`android/app/build.gradle` (ou passe a usar EAS Build).

## Limites conhecidos

- **Mapa sem mapa embutido.** A web usa Leaflet/OpenStreetMap, que não roda em
  nativo, e o mapa nativo exigiria chave do Google Maps, que o projeto não tem.
  A tela mostra a cobertura por cidade e abre o app de mapas do aparelho. Com
  uma chave, dá para trocar por `react-native-maps`.
- **Sem push nativo ainda.** `expo-notifications` está instalado, mas não há
  registro de token nem envio pelo servidor.
- **Financeiro sem gráfico de 6 meses** e sem edição da regra de repasse — as
  duas coisas continuam na web.
- **Sem modo offline.** Toda tela depende da API; sem rede, mostra erro.
- Chat, voz e as telas de administração de usuários não foram portados.
