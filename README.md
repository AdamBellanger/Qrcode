# QR Code Generator

Upload an image, get back a QR code that links to a public URL serving that image.

- **Frontend:** React + TypeScript + Tailwind CSS (Vite)
- **Backend:** Node.js + Express + TypeScript
- **Packages:** `qrcode`, `multer`

## Project structure

```
/
├── client/         React Vite app
├── server/         Express app (entry: src/index.ts)
├── data/           uploaded images (gitignored, Docker volume)
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

## How it works

1. The client uploads an image to `POST /api/upload`.
2. The server stores it in `data/uploads/` under a UUID filename and returns:
   ```json
   { "qrcode": "<base64 png>", "imageUrl": "https://<HOST>/i/<uuid>" }
   ```
3. The QR code encodes `imageUrl`. Scanning it (or visiting `GET /i/:uuid`)
   serves the image directly.

## Local development

Install dependencies:

```bash
npm run install:all
```

Run the backend (port 3001) and frontend (port 5173) in two terminals:

```bash
npm run dev:server
npm run dev:client
```

Vite proxies `/api` and `/i` to the backend, so open http://localhost:5173.

> For local dev the QR codes point at `http://localhost:3001` by default. Set
> `HOST` to override (e.g. an ngrok URL so a phone can scan and reach it).

## Production with Docker

The build compiles the React app, compiles the server, and serves the static
frontend from Express on port 3000.

```bash
cp .env.example .env       # set HOST to your public URL
docker compose up -d --build
```

`HOST` is **required** — it is the public base URL the QR codes encode
(e.g. `https://qr.yourdomain.com`). Run the container behind a reverse proxy
that terminates TLS and forwards to port 3000. Express has `trust proxy`
enabled so it honors `X-Forwarded-*` headers.

Uploaded images persist in `./data` on the host via the `./data:/data` volume.

## Deploying on Hetzner (or any VPS)

1. Point your domain's DNS `A` record at the server's IP.
2. Clone the repo, then:
   ```bash
   echo "HOST=https://qr.yourdomain.com" > .env
   docker compose up -d --build
   ```
3. Put a reverse proxy in front for TLS. **Caddy** is the simplest (auto HTTPS):
   ```bash
   cp Caddyfile.example Caddyfile   # edit the domain
   caddy run --config ./Caddyfile
   ```

### ⚠️ Reverse-proxy upload limit

Uploads can be up to 100 MB (override with `MAX_UPLOAD_MB`). Make sure your proxy
allows it, or uploads fail with `413 Request Entity Too Large`:

- **Caddy** — set in the provided `Caddyfile.example` (`max_size 110MB`).
- **nginx** — add inside the `server` (or `location /api`) block:
  ```nginx
  client_max_body_size 110m;
  ```
- **Traefik** — no body-size limit by default; nothing to do.

The container exposes `GET /api/health` for health checks (already wired into
`docker-compose.yml`).

## Environment variables

| Variable     | Default                  | Description                                  |
| ------------ | ------------------------ | -------------------------------------------- |
| `HOST`       | `http://localhost:3001`  | Public base URL encoded in QR codes.         |
| `PORT`       | `3001` (`3000` in Docker)| Port the server listens on.                  |
| `DATA_DIR`   | `<repo>/data`            | Where uploads are stored (`/data` in Docker).|
| `CLIENT_DIR` | `<repo>/client/dist`     | Built frontend served as static files.       |
| `MAX_UPLOAD_MB` | `100`                 | Max upload size in MB.                        |
```
