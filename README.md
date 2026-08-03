# OGG Komende Diensten

Een mobiele PWA voor komende OGG-diensten. De statische app draait op GitHub Pages; de beveiligde gegevensophaalactie draait in een Cloudflare Worker. De Kerkdienstgemist-token komt uitsluitend als Cloudflare Secret in de Worker terecht en nooit in GitHub, JavaScript of de browser.

## Architectuur

```
Android / browser → GitHub Pages (frontend) → Cloudflare Worker (/api/services) → Kerkdienstgemist API
                                                └─ KERKDIENSTGEMIST_TOKEN secret
```

De frontend bevat alleen de openbare Worker-URL in `config.js`. De Worker accepteert uitsluitend aanvragen vanaf de GitHub Pages-oorsprong.

## In 10 minuten online

### 1. Push naar GitHub

```powershell
git push -u origin main
```

### 2. Publiceer de frontend op GitHub Pages (2 minuten)

1. Open de repository op GitHub, kies **Settings → Pages**.
2. Kies bij **Build and deployment**: **Deploy from a branch**.
3. Selecteer branch **main** en map **/(root)**, daarna **Save**.
4. De frontend komt op: `https://simonschenk1997-dotcom.github.io/OGG-Komende-Diensten/`.

### 3. Maak de Cloudflare Worker (4 minuten)

1. Maak gratis een Cloudflare-account en installeer de CLI: `npm install -g wrangler`.
2. Log in: `wrangler login`.
3. Vanuit deze projectmap: `wrangler deploy`.
4. Cloudflare toont de publieke Worker-URL, bijvoorbeeld `https://ogg-komende-diensten-api.jouw-account.workers.dev`.

### 4. Zet de token veilig als secret (1 minuut)

Voer lokaal uit; plak de token alleen wanneer Cloudflare daarom vraagt:

```powershell
wrangler secret put KERKDIENSTGEMIST_TOKEN
```

De exacte secretnaam moet **KERKDIENSTGEMIST_TOKEN** zijn. De waarde wordt versleuteld opgeslagen door Cloudflare en is daarna niet meer uitleesbaar. Plaats de token nooit in `config.js`, `.env`, `README.md` of een Git-commit.

### 5. Verbind de frontend met de Worker (1 minuut)

Vervang in `config.js` alleen `YOUR-WORKER-NAME.YOUR-SUBDOMAIN` door de URL die Cloudflare bij stap 3 gaf. Bijvoorbeeld:

```js
apiUrl: 'https://ogg-komende-diensten-api.jouw-account.workers.dev/api/services'
```

Commit en push deze publieke URL:

```powershell
git add config.js
git commit -m "Configure Cloudflare Worker URL"
git push
```

Na een minuut werkt de GitHub Pages-site. Open deze op Android en kies **Installeren** in Chrome.

## Lokale controle

Voor alleen de Worker: `wrangler dev`. Maak voor lokaal gebruik eventueel `.dev.vars` met `KERKDIENSTGEMIST_TOKEN=...`; dit bestand staat in `.gitignore`.

## Bestanden

- `index.html`, `style.css`, `app.js`: GitHub Pages-frontend.
- `config.js`: alleen publieke Worker-URL.
- `worker.js`: Cloudflare Worker met tokenbescherming en CORS.
- `wrangler.toml`: Worker-configuratie.
- `manifest.json`, `service-worker.js`, `icons/`: PWA-installatie en offline app-shell.
