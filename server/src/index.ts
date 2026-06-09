import express, { type Request, type Response, type NextFunction } from 'express'
import multer from 'multer'
import QRCode from 'qrcode'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ---- Config -----------------------------------------------------------------
const PORT = Number(process.env.PORT) || 3001
// Public-facing base URL the QR code points at. Must be set behind a proxy.
const HOST = (process.env.HOST || 'http://localhost:3001').replace(/\/+$/, '')
// Where uploaded images live (Docker volume mounts here).
const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, '../../data')
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads')
// Built React app (copied here by the Dockerfile).
const CLIENT_DIR = process.env.CLIENT_DIR || path.resolve(__dirname, '../../client/dist')

// Max upload size in MB (override with MAX_UPLOAD_MB). Keep your reverse proxy's
// body-size limit at least this high (see Caddyfile / nginx note in the README).
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB) || 100
const MAX_SIZE = MAX_UPLOAD_MB * 1024 * 1024

// Extensions we display in the browser instead of forcing a download.
const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp'])
const VIDEO_EXT = new Set(['mp4', 'webm'])
const AUDIO_EXT = new Set(['mp3', 'wav', 'ogg'])

// Correct Content-Type for the formats we serve directly (browsers can be vague).
const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  pdf: 'application/pdf',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  html: 'text/html',
  htm: 'text/html',
  txt: 'text/plain',
  svg: 'image/svg+xml',
}

// Extensions served inline as-is (browser renders them) rather than downloaded.
const INLINE_EXT = new Set(['pdf', 'html', 'htm', 'txt', 'svg'])

// Legacy: /i/ and /img/ still resolve old image-only uploads by extension.
const EXT_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
}

fs.mkdirSync(UPLOAD_DIR, { recursive: true })

// ---- App --------------------------------------------------------------------
const app = express()
// Correct protocol/host detection when running behind a reverse proxy.
app.set('trust proxy', true)
// Parse JSON bodies (used by POST /api/qrcode).
app.use(express.json())

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    // Keep the original extension (sanitized) so the file type is preserved.
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '')
    cb(null, `${randomUUID()}${ext}`)
  },
})

// Accept any file type; the only limit is size.
const upload = multer({ storage, limits: { fileSize: MAX_SIZE } })

// GET /api/health — liveness probe for Docker / the reverse proxy.
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' })
})

// POST /api/upload — accept any file, return a QR code + public file URL.
app.post('/api/upload', (req: Request, res: Response) => {
  upload.single('file')(req, res, async (err: unknown) => {
    if (err instanceof multer.MulterError) {
      const msg =
        err.code === 'LIMIT_FILE_SIZE'
          ? `Fichier trop volumineux. Taille maximale : ${MAX_UPLOAD_MB} Mo.`
          : err.message
      return res.status(400).json({ error: msg })
    }
    if (err) {
      return res.status(400).json({ error: (err as Error).message })
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier envoyé.' })
    }

    // Public URLs are extension-less (/f/<uuid>); persist the original name and
    // mimetype in a sidecar so /f/ can restore them later.
    const uuid = path.parse(req.file.filename).name
    fs.writeFileSync(
      path.join(UPLOAD_DIR, `${uuid}.json`),
      JSON.stringify({
        name: req.file.originalname,
        mime: req.file.mimetype,
        stored: req.file.filename,
      }),
    )
    const fileUrl = `${HOST}/f/${uuid}`

    try {
      const qrcode = await QRCode.toDataURL(fileUrl, {
        margin: 1,
        width: 512,
        errorCorrectionLevel: 'M',
      })
      res.json({ qrcode, fileUrl })
    } catch {
      res.status(500).json({ error: 'Failed to generate QR code.' })
    }
  })
})

// Add a scheme if missing, then validate. Returns null if not a usable URL.
function normalizeUrl(raw: unknown): string | null {
  const text = String(raw ?? '').trim()
  if (!text) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`
  try {
    return new URL(withScheme).toString()
  } catch {
    return null
  }
}

// POST /api/qrcode — generate a QR code straight from a pasted URL (no upload).
app.post('/api/qrcode', async (req: Request, res: Response) => {
  const url = normalizeUrl((req.body as { url?: unknown } | undefined)?.url)
  if (!url) {
    return res.status(400).json({ error: 'URL invalide.' })
  }
  try {
    const qrcode = await QRCode.toDataURL(url, {
      margin: 1,
      width: 512,
      errorCorrectionLevel: 'M',
    })
    res.json({ qrcode, fileUrl: url })
  } catch {
    res.status(500).json({ error: 'Failed to generate QR code.' })
  }
})

// Locate the stored file for a UUID (extension is unknown to the public URL).
// Returns null if no matching file exists.
function resolveImagePath(
  uuid: string,
): { filePath: string; mime: string } | null {
  for (const ext of Object.keys(EXT_TO_MIME)) {
    const filePath = path.join(UPLOAD_DIR, `${uuid}.${ext}`)
    if (fs.existsSync(filePath)) {
      return { filePath, mime: EXT_TO_MIME[ext] }
    }
  }
  return null
}

// GET /i/:uuid — serve the stored image wrapped in a centered HTML page.
app.get('/i/:uuid', (req: Request, res: Response) => {
  const { uuid } = req.params
  // Reject anything that isn't a bare UUID to prevent path traversal.
  if (!/^[0-9a-fA-F-]{36}$/.test(uuid)) {
    return res.status(400).send('Invalid id')
  }
  if (!resolveImagePath(uuid)) {
    return res.status(404).send('Image not found')
  }
  const imageUrl = `${HOST}/img/${uuid}`
  res.send(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Image</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 100%; height: 100%;
      background: #000;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    img {
      max-width: 100vw;
      max-height: 100vh;
      object-fit: contain;
    }
  </style>
</head>
<body>
  <img src="${imageUrl}" alt="image" />
</body>
</html>`)
})

// GET /img/:uuid — serve the raw image file (used by the HTML wrapper above).
app.get('/img/:uuid', (req: Request, res: Response) => {
  const { uuid } = req.params
  if (!/^[0-9a-fA-F-]{36}$/.test(uuid)) {
    return res.status(400).send('Invalid id')
  }
  const found = resolveImagePath(uuid)
  if (!found) {
    return res.status(404).send('Image not found')
  }
  res.type(found.mime)
  res.sendFile(found.filePath)
})

// Resolve any uploaded file by UUID via its metadata sidecar (falls back to
// legacy image-only uploads that predate the sidecar).
function resolveFile(
  uuid: string,
): { filePath: string; name: string; mime: string; ext: string } | null {
  const metaPath = path.join(UPLOAD_DIR, `${uuid}.json`)
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
      const filePath = path.join(UPLOAD_DIR, meta.stored)
      if (fs.existsSync(filePath)) {
        const ext = path.extname(meta.stored).slice(1).toLowerCase()
        return {
          filePath,
          name: meta.name || meta.stored,
          mime: MIME_BY_EXT[ext] || meta.mime || 'application/octet-stream',
          ext,
        }
      }
    } catch {
      /* corrupt sidecar — fall through to legacy lookup */
    }
  }
  const img = resolveImagePath(uuid)
  if (img) {
    const ext = path.extname(img.filePath).slice(1).toLowerCase()
    return { filePath: img.filePath, name: path.basename(img.filePath), mime: img.mime, ext }
  }
  return null
}

// Build a Content-Disposition header that keeps the original (possibly
// non-ASCII) filename, per RFC 5987.
function contentDisposition(kind: 'inline' | 'attachment', name: string): string {
  const ascii = name.replace(/[\r\n"\\]/g, '_').replace(/[^\x20-\x7e]/g, '_')
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`
}

// Minimal centered black page wrapping a media element.
function mediaPage(title: string, inner: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 100%; height: 100%;
      background: #000;
      display: flex; align-items: center; justify-content: center;
    }
    img, video { max-width: 100vw; max-height: 100vh; object-fit: contain; }
    audio { width: min(90vw, 480px); }
  </style>
</head>
<body>
  ${inner}
</body>
</html>`
}

// GET /f/:uuid — display (image/video/audio/pdf) or download any uploaded file.
app.get('/f/:uuid', (req: Request, res: Response) => {
  const { uuid } = req.params
  if (!/^[0-9a-fA-F-]{36}$/.test(uuid)) {
    return res.status(400).send('Invalid id')
  }
  const found = resolveFile(uuid)
  if (!found) {
    return res.status(404).send('File not found')
  }

  // Raw bytes — used by the viewer pages below; sendFile supports Range so
  // video/audio can seek.
  if (req.query.raw !== undefined) {
    res.setHeader('Content-Disposition', contentDisposition('inline', found.name))
    res.type(found.mime)
    return res.sendFile(found.filePath)
  }

  const rawUrl = `${HOST}/f/${uuid}?raw=1`

  if (INLINE_EXT.has(found.ext)) {
    // Render in the browser (PDF viewer, HTML page, text, SVG) instead of
    // downloading.
    res.setHeader('Content-Disposition', contentDisposition('inline', found.name))
    res.type(found.mime)
    return res.sendFile(found.filePath)
  }
  if (IMAGE_EXT.has(found.ext)) {
    return res.send(mediaPage('Image', `<img src="${rawUrl}" alt="image" />`))
  }
  if (VIDEO_EXT.has(found.ext)) {
    return res.send(
      mediaPage('Vidéo', `<video src="${rawUrl}" controls autoplay playsinline></video>`),
    )
  }
  if (AUDIO_EXT.has(found.ext)) {
    return res.send(mediaPage('Audio', `<audio src="${rawUrl}" controls autoplay></audio>`))
  }

  // Everything else: download with the original filename.
  res.setHeader('Content-Disposition', contentDisposition('attachment', found.name))
  res.type(found.mime)
  return res.sendFile(found.filePath)
})

// Serve the built React frontend.
app.use(express.static(CLIENT_DIR))

// SPA fallback: any non-API GET returns index.html.
app.get(/^(?!\/(api|i|img|f)\/).*/, (_req: Request, res: Response) => {
  res.sendFile(path.join(CLIENT_DIR, 'index.html'))
})

// Final error handler.
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err)
  res.status(500).json({ error: 'Internal server error.' })
})

app.listen(PORT, () => {
  console.log(`Server listening on :${PORT}`)
  console.log(`Public host: ${HOST}`)
  console.log(`Uploads dir: ${UPLOAD_DIR}`)
})
