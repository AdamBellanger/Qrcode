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
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB) || 25
const MAX_SIZE = MAX_UPLOAD_MB * 1024 * 1024

// mimetype -> file extension for the accepted image formats.
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
}
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

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = MIME_TO_EXT[file.mimetype] ?? 'bin'
    cb(null, `${randomUUID()}.${ext}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    if (MIME_TO_EXT[file.mimetype]) cb(null, true)
    else cb(new Error('Unsupported file type. Use JPG, PNG, GIF, or WebP.'))
  },
})

// GET /api/health — liveness probe for Docker / the reverse proxy.
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' })
})

// POST /api/upload — accept one image, return a QR code + public image URL.
app.post('/api/upload', (req: Request, res: Response) => {
  upload.single('image')(req, res, async (err: unknown) => {
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
      return res.status(400).json({ error: 'No image uploaded.' })
    }

    // Strip the extension: public URLs are extension-less (/i/<uuid>).
    const uuid = path.parse(req.file.filename).name
    const imageUrl = `${HOST}/i/${uuid}`

    try {
      const qrcode = await QRCode.toDataURL(imageUrl, {
        margin: 1,
        width: 512,
        errorCorrectionLevel: 'M',
      })
      res.json({ qrcode, imageUrl })
    } catch {
      res.status(500).json({ error: 'Failed to generate QR code.' })
    }
  })
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

// Serve the built React frontend.
app.use(express.static(CLIENT_DIR))

// SPA fallback: any non-API GET returns index.html.
app.get(/^(?!\/(api|i|img)\/).*/, (_req: Request, res: Response) => {
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
