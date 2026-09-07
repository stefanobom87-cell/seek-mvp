# SEEK MVP

Primo prototipo di motore di ricerca multimediale + selezione qualità.

## Cosa fa già

- Ricerca testuale tramite una istanza SearXNG configurabile.
- Aggrega risultati web/video/immagini.
- Analizza una sorgente supportata con `yt-dlp` senza cookie, login o opzioni di bypass.
- Mostra i formati/qualità realmente disponibili: risoluzione, FPS, container, audio/video e dimensione quando disponibile.
- Backend già capace di scaricare uno specifico `format_id`.
- Struttura pronta per aggiungere provider separati (Internet Archive, Wikimedia, API video, podcast, ecc.).

> Usare il download solo per contenuti propri, autorizzati, public domain, Creative Commons o comunque scaricabili nel rispetto dei diritti e delle condizioni della fonte. Il progetto non include bypass DRM, paywall, autenticazione o protezioni tecniche.

## Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Imposta `SEARXNG_URL` nel file `.env`, poi:

```bash
set -a
source .env
set +a
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Test:

```bash
curl http://127.0.0.1:8000/health
```

## Frontend Expo

Crea il contenitore Expo aggiornato:

```bash
npx create-expo-app@latest seek-mobile
cd seek-mobile
```

Sostituisci il file `App.tsx` con `frontend/App.tsx` di questo pacchetto.

Nel simulatore iOS puoi tenere:

```ts
const API = "http://127.0.0.1:8000";
```

Su iPhone fisico usa invece l'IP locale del Mac, per esempio:

```ts
const API = "http://192.168.1.50:8000";
```

Poi:

```bash
npx expo start
```

## Prossimi step consigliati

1. Collegare davvero il pulsante Scarica al filesystem iOS/Android con barra di avanzamento.
2. Aggiungere profili rapidi: Massima qualità, Bilanciata, Risparmio spazio, Solo audio.
3. Aggiungere più provider di ricerca e ranking semantico.
4. Aggiungere ricerca per fotogramma/immagine.
5. Inserire coda download, cronologia e libreria locale.
6. In seguito: worker Tor separato e isolato, solo per fonti lecite e con scansione dei file.
