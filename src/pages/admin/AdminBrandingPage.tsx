import { useEffect, useState, type FormEvent } from 'react'
import { useBranding } from '../../context/BrandingContext'
import { argbToHex, hexToArgb } from '../../types/models'

const PRESETS = [
  { name: 'Indigo', primary: '#1a237e', accent: '#ff6f00' },
  { name: 'Navy', primary: '#0d1b2a', accent: '#00b4d8' },
  { name: 'Forest', primary: '#1b4332', accent: '#d4a017' },
  { name: 'Maroon', primary: '#6b0504', accent: '#c9b27c' },
  { name: 'Slate', primary: '#37474f', accent: '#ff7043' },
  { name: 'Purple', primary: '#4a148c', accent: '#00bcd4' },
  { name: 'Teal', primary: '#004d40', accent: '#ff6f00' },
  { name: 'Rose', primary: '#880e4f', accent: '#1de9b6' },
]

export default function AdminBrandingPage() {
  const { branding, saveBranding } = useBranding()

  const [orgName, setOrgName] = useState(branding.orgName)
  const [logoUrl, setLogoUrl] = useState(branding.logoUrl ?? '')
  const [primary, setPrimary] = useState(argbToHex(branding.primaryColorValue))
  const [accent, setAccent] = useState(argbToHex(branding.accentColorValue))
  const [pdfHeader1, setPdfHeader1] = useState(branding.pdfHeaderLine1)
  const [pdfHeader2, setPdfHeader2] = useState(branding.pdfHeaderLine2)
  const [selfSignup, setSelfSignup] = useState(branding.selfSignupEnabled)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  // Sync the form when the branding doc first loads / changes elsewhere.
  useEffect(() => {
    setOrgName(branding.orgName)
    setLogoUrl(branding.logoUrl ?? '')
    setPrimary(argbToHex(branding.primaryColorValue))
    setAccent(argbToHex(branding.accentColorValue))
    setPdfHeader1(branding.pdfHeaderLine1)
    setPdfHeader2(branding.pdfHeaderLine2)
    setSelfSignup(branding.selfSignupEnabled)
  }, [branding])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    await saveBranding({
      orgName: orgName.trim() || 'Photographer Scheduler',
      logoUrl: logoUrl.trim() || null,
      primaryColorValue: hexToArgb(primary),
      accentColorValue: hexToArgb(accent),
      pdfHeaderLine1: pdfHeader1.trim() || 'Photographer Schedule',
      pdfHeaderLine2: pdfHeader2.trim(),
      selfSignupEnabled: selfSignup,
    })
    setBusy(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const field =
    'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30'
  const label = 'mb-1 block text-sm font-medium text-gray-700'

  return (
    <div className="mx-auto max-w-xl">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">Branding</h2>

      {/* Live preview */}
      <div className="mb-6 overflow-hidden rounded-xl border border-gray-200 shadow-sm">
        <div className="flex items-center gap-3 px-4 py-3" style={{ backgroundColor: primary }}>
          {logoUrl && <img src={logoUrl} alt="" className="h-8 w-8 rounded object-contain" />}
          <span className="font-semibold text-white">{orgName || 'Photographer Scheduler'}</span>
          <span
            className="ml-auto rounded-full px-3 py-1 text-xs font-semibold text-white"
            style={{ backgroundColor: accent }}
          >
            Accent
          </span>
        </div>
        <div className="bg-white px-4 py-3 text-sm text-gray-500">
          Colors apply live across the app when saved. The same branding document is shared with the
          iOS app.
        </div>
      </div>

      <form onSubmit={submit} className="space-y-5 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div>
          <label className={label} htmlFor="orgName">
            Organization Name
          </label>
          <input id="orgName" value={orgName} onChange={(e) => setOrgName(e.target.value)} className={field} />
        </div>

        <div>
          <label className={label} htmlFor="logoUrl">
            Logo URL <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <input id="logoUrl" type="url" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} className={field} placeholder="https://…" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={label} htmlFor="primaryColor">
              Primary Color
            </label>
            <div className="flex items-center gap-2">
              <input
                id="primaryColor"
                type="color"
                value={primary}
                onChange={(e) => setPrimary(e.target.value)}
                className="h-9 w-14 cursor-pointer rounded border border-gray-300"
              />
              <code className="text-xs text-gray-500">{primary}</code>
            </div>
          </div>
          <div>
            <label className={label} htmlFor="accentColor">
              Accent Color
            </label>
            <div className="flex items-center gap-2">
              <input
                id="accentColor"
                type="color"
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
                className="h-9 w-14 cursor-pointer rounded border border-gray-300"
              />
              <code className="text-xs text-gray-500">{accent}</code>
            </div>
          </div>
        </div>

        <div>
          <p className={label}>Presets</p>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => {
                  setPrimary(p.primary)
                  setAccent(p.accent)
                }}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:border-gray-400"
              >
                <span className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: p.primary }} />
                <span className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: p.accent }} />
                {p.name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className={label} htmlFor="pdf1">
            Print Header Line 1
          </label>
          <input id="pdf1" value={pdfHeader1} onChange={(e) => setPdfHeader1(e.target.value)} className={field} />
        </div>
        <div>
          <label className={label} htmlFor="pdf2">
            Print Header Line 2 <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <input id="pdf2" value={pdfHeader2} onChange={(e) => setPdfHeader2(e.target.value)} className={field} />
        </div>

        <label className="flex items-start gap-3 rounded-lg border border-gray-200 p-3">
          <input
            type="checkbox"
            checked={selfSignup}
            onChange={(e) => setSelfSignup(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-[var(--color-primary)]"
          />
          <span className="text-sm">
            <span className="font-medium text-gray-800">Allow photographer self-signup</span>
            <br />
            <span className="text-gray-500">
              When off, photographers can only be assigned to events by an admin.
            </span>
          </span>
        </label>

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Saving…' : saved ? 'Saved ✓' : 'Save Branding'}
        </button>
      </form>
    </div>
  )
}
