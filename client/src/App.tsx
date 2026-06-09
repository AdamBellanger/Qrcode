import { useCallback, useRef, useState } from 'react'

const ACCEPTED = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const MAX_MB = 25
const MAX_SIZE = MAX_MB * 1024 * 1024

// École IRIS — campus de Rouen. Dépose le logo dans client/public/iris-logo.svg
const IRIS_URL = 'https://ecoleiris.fr/campus/rouen'
const IRIS_LOGO = '/iris-logo.svg'

interface UploadResult {
  qrcode: string
  imageUrl: string
}

function App() {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [result, setResult] = useState<UploadResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [copied, setCopied] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const glowRef = useRef<HTMLDivElement>(null)

  // A4 poster customization
  const [customizing, setCustomizing] = useState(false)
  const [posterTitle, setPosterTitle] = useState('Scannez-moi !')
  const [posterSubtitle, setPosterSubtitle] = useState(
    "Pointez l'appareil photo de votre téléphone sur le code",
  )
  const [posterColor, setPosterColor] = useState('#0b0c0f')
  const [showUrl, setShowUrl] = useState(true)
  const PRESET_COLORS = ['#0b0c0f', '#4f46e5', '#0ea5e9', '#16a34a', '#db2777', '#ea580c']

  // Glow that trails the cursor (the "anti-gravity" feel). Updated via ref so
  // pointer moves don't trigger React re-renders.
  const onPointerMove = (e: React.PointerEvent) => {
    const el = glowRef.current
    if (el) {
      el.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -50%)`
    }
  }

  const selectFile = useCallback((f: File) => {
    setError(null)
    setResult(null)
    if (!ACCEPTED.includes(f.type)) {
      setError('Format non supporté. Utilisez JPG, PNG, GIF ou WebP.')
      return
    }
    if (f.size > MAX_SIZE) {
      setError(`Fichier trop volumineux. Taille maximale : ${MAX_MB} Mo.`)
      return
    }
    setFile(f)
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(f)
    })
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const f = e.dataTransfer.files?.[0]
      if (f) selectFile(f)
    },
    [selectFile],
  )

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) selectFile(f)
  }

  const upload = async () => {
    if (!file) return
    setLoading(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('image', file)
      const res = await fetch('/api/upload', { method: 'POST', body: form })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Échec de l'envoi (${res.status})`)
      }
      const data: UploadResult = await res.json()
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de l'envoi.")
    } finally {
      setLoading(false)
    }
  }

  const reset = () => {
    if (preview) URL.revokeObjectURL(preview)
    setFile(null)
    setPreview(null)
    setResult(null)
    setError(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const downloadQr = () => {
    if (!result) return
    const a = document.createElement('a')
    a.href = result.qrcode
    a.download = 'qrcode.png'
    a.click()
  }

  const printQr = () => window.print()

  const copyLink = async () => {
    if (!result) return
    await navigator.clipboard.writeText(result.imageUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <>
    <div
      onPointerMove={onPointerMove}
      className="relative flex min-h-full flex-col overflow-hidden bg-gradient-to-b from-[#2a2e36] via-[#16181d] to-[#0b0c0f] text-zinc-100"
    >
      {/* Flowing liquid-mesh background + cursor glow */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div className="mesh">
          <span className="blob blob-1" />
          <span className="blob blob-2" />
          <span className="blob blob-3" />
          <span className="blob blob-4" />
          <span className="blob blob-5" />
        </div>
        {/* Subtle dark vignette so the glass card stays readable */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(11,12,15,0.6))]" />

        {/* Animated waves */}
        <svg
          className="waves"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 24 150 28"
          preserveAspectRatio="none"
        >
          <defs>
            <path
              id="wave"
              d="M-160 44c30 0 58-18 88-18s 58 18 88 18 58-18 88-18 58 18 88 18 v44h-352z"
            />
          </defs>
          <g className="wave-parallax">
            <use href="#wave" x="48" y="0" fill="rgba(203,213,225,0.06)" />
            <use href="#wave" x="48" y="3" fill="rgba(148,163,184,0.08)" />
            <use href="#wave" x="48" y="5" fill="rgba(100,116,139,0.12)" />
            <use href="#wave" x="48" y="7" fill="rgba(71,85,105,0.22)" />
          </g>
        </svg>

        <div ref={glowRef} className="cursor-glow" />
      </div>

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 py-10">
        {/* Brand */}
        <div className="animate-fade-up mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md shadow-lg">
            <svg
              className="h-6 w-6 text-white"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.75 4.5h4.5v4.5h-4.5zM15.75 4.5h4.5v4.5h-4.5zM3.75 15h4.5v4.5h-4.5zM15.75 15h3M18.75 15v4.5M15.75 18.75h3"
              />
            </svg>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-[#f3f4f7] sm:text-4xl">
            QR Generator
          </h1>
          <p className="mt-2 text-sm text-zinc-300">
            Envoyez une image, obtenez un QR code à partager.
          </p>
        </div>

        {/* Glass card */}
        <div className="animate-fade-up w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.06] p-6 shadow-2xl shadow-black/40 backdrop-blur-2xl ring-1 ring-white/5">
          {!result ? (
            <>
              <div
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                onClick={() => inputRef.current?.click()}
                className={`group cursor-pointer rounded-2xl border border-dashed p-8 text-center transition-all duration-200 ${
                  dragging
                    ? 'border-violet-400/70 bg-violet-400/10 scale-[1.01]'
                    : 'border-white/15 bg-white/[0.02] hover:border-white/30 hover:bg-white/[0.04]'
                }`}
              >
                {preview ? (
                  <img
                    src={preview}
                    alt="Aperçu"
                    className="animate-pop-in mx-auto max-h-48 rounded-xl object-contain shadow-lg"
                  />
                ) : (
                  <div className="text-zinc-300">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 transition-transform duration-200 group-hover:scale-110">
                      <svg
                        className="h-7 w-7 text-zinc-300"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 7.5L12 3m0 0L7.5 7.5M12 3v13.5"
                        />
                      </svg>
                    </div>
                    <p className="text-base font-semibold text-[#eceef2]">
                      Glissez une image ici
                    </p>
                    <p className="mt-1 text-sm text-zinc-300">
                      ou cliquez pour parcourir
                    </p>
                    <p className="mt-4 text-xs text-zinc-400">
                      JPG, PNG, GIF, WebP · {MAX_MB} Mo max
                    </p>
                  </div>
                )}
                <input
                  ref={inputRef}
                  type="file"
                  accept={ACCEPTED.join(',')}
                  onChange={onFileChange}
                  className="hidden"
                />
              </div>

              {file && (
                <p className="mt-3 truncate text-sm text-zinc-300">
                  Sélectionné :{' '}
                  <span className="font-medium text-[#eceef2]">{file.name}</span>
                </p>
              )}

              {error && (
                <p className="animate-pop-in mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                  {error}
                </p>
              )}

              <div className="mt-5 flex gap-3">
                <button
                  onClick={upload}
                  disabled={!file || loading}
                  className={`relative flex-1 overflow-hidden rounded-xl bg-white py-2.5 font-semibold text-zinc-900 transition-all hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-30 ${
                    loading ? 'shimmer' : ''
                  }`}
                >
                  {loading ? 'Génération…' : 'Générer le QR code'}
                </button>
                {file && !loading && (
                  <button
                    onClick={reset}
                    className="rounded-xl border border-white/15 px-4 font-medium text-zinc-300 transition-colors hover:bg-white/5"
                  >
                    Effacer
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="animate-pop-in text-center">
              <div className="mx-auto inline-block rounded-2xl bg-white p-4 shadow-xl">
                <img
                  src={result.qrcode}
                  alt="QR code"
                  className="mx-auto h-auto w-44 max-w-full sm:w-56"
                />
              </div>

              <div className="mt-5 text-left">
                <label className="text-xs uppercase tracking-wider text-zinc-400">
                  Lien de l'image
                </label>
                <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                  <a
                    href={result.imageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 truncate text-sm text-sky-300 hover:underline"
                  >
                    {result.imageUrl}
                  </a>
                  <button
                    onClick={copyLink}
                    className="shrink-0 text-xs font-medium text-zinc-300 transition-colors hover:text-white"
                  >
                    {copied ? 'Copié !' : 'Copier'}
                  </button>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <button
                  onClick={downloadQr}
                  className="rounded-xl bg-white py-2.5 font-semibold text-zinc-900 transition-colors hover:bg-zinc-200"
                >
                  Télécharger PNG
                </button>
                <button
                  onClick={printQr}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 py-2.5 font-semibold text-white transition-colors hover:bg-white/10"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.8}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.4 42.4 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0V4.875c0-.621-.504-1.125-1.125-1.125h-9.25c-.621 0-1.125.504-1.125 1.125v2.913m12.5 0a48.667 48.667 0 00-12.5 0"
                    />
                  </svg>
                  Imprimer A4
                </button>
              </div>

              {/* Personnalisation de l'affiche A4 */}
              <button
                onClick={() => setCustomizing((v) => !v)}
                className="mt-3 flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/10"
              >
                <span>Personnaliser l'affiche</span>
                <svg
                  className={`h-4 w-4 transition-transform ${customizing ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {customizing && (
                <div className="animate-pop-in mt-3 space-y-3 rounded-xl border border-white/10 bg-black/20 p-4 text-left">
                  {/* Aperçu live de l'affiche (rendu papier en miniature) */}
                  <div className="rounded-lg bg-white px-3 py-4 text-center shadow-inner">
                    {posterTitle && (
                      <p
                        style={{ color: posterColor }}
                        className="text-lg font-extrabold leading-tight"
                      >
                        {posterTitle}
                      </p>
                    )}
                    <img
                      src={result.qrcode}
                      alt="QR code"
                      className="mx-auto my-2 h-20 w-20"
                    />
                    {posterSubtitle && (
                      <p className="text-[10px] text-zinc-600">{posterSubtitle}</p>
                    )}
                    {showUrl && (
                      <p className="mt-1 break-all text-[9px] text-zinc-400">
                        {result.imageUrl}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="text-xs uppercase tracking-wider text-zinc-400">
                      Titre
                    </label>
                    <input
                      type="text"
                      value={posterTitle}
                      onChange={(e) => setPosterTitle(e.target.value)}
                      maxLength={40}
                      className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[#eceef2] outline-none focus:border-white/30"
                    />
                  </div>

                  <div>
                    <label className="text-xs uppercase tracking-wider text-zinc-400">
                      Sous-titre
                    </label>
                    <input
                      type="text"
                      value={posterSubtitle}
                      onChange={(e) => setPosterSubtitle(e.target.value)}
                      maxLength={90}
                      placeholder="(laisser vide pour masquer)"
                      className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[#eceef2] outline-none placeholder:text-zinc-500 focus:border-white/30"
                    />
                  </div>

                  <div>
                    <label className="text-xs uppercase tracking-wider text-zinc-400">
                      Couleur du titre
                    </label>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      {PRESET_COLORS.map((c) => (
                        <button
                          key={c}
                          onClick={() => setPosterColor(c)}
                          style={{ backgroundColor: c }}
                          aria-label={`Couleur ${c}`}
                          className={`h-6 w-6 rounded-full border transition-transform hover:scale-110 ${
                            posterColor === c
                              ? 'border-white ring-2 ring-white/40'
                              : 'border-white/20'
                          }`}
                        />
                      ))}
                      <input
                        type="color"
                        value={posterColor}
                        onChange={(e) => setPosterColor(e.target.value)}
                        aria-label="Couleur personnalisée"
                        className="h-6 w-8 cursor-pointer rounded border border-white/20 bg-transparent"
                      />
                    </div>
                  </div>

                  <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
                    <input
                      type="checkbox"
                      checked={showUrl}
                      onChange={(e) => setShowUrl(e.target.checked)}
                      className="h-4 w-4 accent-indigo-500"
                    />
                    Afficher le lien sous le QR code
                  </label>
                </div>
              )}

              <button
                onClick={reset}
                className="mt-3 w-full rounded-xl border border-white/10 py-2 text-sm font-medium text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-200"
              >
                Nouveau QR code
              </button>
            </div>
          )}
        </div>

        <p className="animate-fade-up mt-6 text-center text-xs text-zinc-400">
          Scannez le QR code pour ouvrir l'image directement.
        </p>
      </main>

      {/* Footer — transparent, seuls les 3 pills glassmorphism sont visibles */}
      <footer className="relative z-10 px-6 pb-6 pt-2 sm:px-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-3 sm:grid sm:grid-cols-3 sm:items-center">
          {/* Gauche — pill QR */}
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-zinc-300 shadow-lg shadow-black/20 backdrop-blur-md sm:justify-self-start">
            <svg
              className="h-3.5 w-3.5 text-zinc-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.75 4.5h4.5v4.5h-4.5zM15.75 4.5h4.5v4.5h-4.5zM3.75 15h4.5v4.5h-4.5zM15.75 15h3M18.75 15v4.5M15.75 18.75h3"
              />
            </svg>
            QR Generator
          </div>

          {/* Centre — pill crédit */}
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-zinc-400 shadow-lg shadow-black/20 backdrop-blur-md sm:justify-self-center">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/80" />
            Made by{' '}
            <span className="font-medium text-zinc-200">Adam Bellanger</span>
          </div>

          {/* Droite — pill IRIS */}
          <a
            href={IRIS_URL}
            target="_blank"
            rel="noreferrer"
            className="group inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-zinc-200 shadow-lg shadow-black/20 backdrop-blur-md transition-all hover:border-white/25 hover:bg-white/10 sm:justify-self-end"
          >
            <img
              src={IRIS_LOGO}
              alt="IRIS"
              className="h-4 w-4 object-contain"
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
            />
            <span>IRIS</span>
            <svg
              className="h-3 w-3 text-zinc-400 transition-transform group-hover:translate-x-0.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
              />
            </svg>
          </a>
        </div>
      </footer>
    </div>

    {/* A4 print poster — only visible when printing (direct child of #root) */}
    {result && (
      <div className="print-poster">
        {posterTitle && <h2 style={{ color: posterColor }}>{posterTitle}</h2>}
        <img src={result.qrcode} alt="QR code" />
        {posterSubtitle && <p>{posterSubtitle}</p>}
        {showUrl && <p className="url">{result.imageUrl}</p>}
      </div>
    )}
    </>
  )
}

export default App
