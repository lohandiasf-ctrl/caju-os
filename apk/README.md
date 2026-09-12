# APK de teste

`caju-os-nativo-0.1.0.apk` — build de teste do app nativo (`mobile/`), assinado
com a chave de debug do Expo, só `arm64-v8a`.

Binário versionado para dar um link de download direto no celular. **Apague
esta pasta antes de juntar o branch na `main`** — APK no histórico do Git
engorda o repositório para sempre. O caminho definitivo é o artifact do
workflow `APK Android` ou um release do GitHub.

- SHA-256: `3eb52106245dc1b95e81e371931e193892622dce75df659f3d8fb3f790755da2`
- Gerado de: `mobile/`, `expo prebuild` + `assembleRelease`
