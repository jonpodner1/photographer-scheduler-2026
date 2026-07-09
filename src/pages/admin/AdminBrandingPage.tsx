import { useEffect, useState, type FormEvent } from 'react'
import { useBranding } from '../../context/BrandingContext'
import { argbToHex, hexToArgb } from '../../types/models'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

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

  return (
    <div className="mx-auto max-w-xl">
      <h2 className="mb-4 text-lg font-semibold">Branding</h2>

      {/* Live preview */}
      <Card className="mb-6 gap-0 overflow-hidden py-0">
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
        <div className="px-4 py-3 text-sm text-muted-foreground">
          Colors apply live across the app when saved. The same branding document is shared with the
          iOS app.
        </div>
      </Card>

      <Card>
        <CardContent>
          <form onSubmit={submit} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="orgName">Organization Name</Label>
              <Input id="orgName" value={orgName} onChange={(e) => setOrgName(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="logoUrl">
                Logo URL <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="logoUrl"
                type="url"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://…"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="primaryColor">Primary Color</Label>
                <div className="flex items-center gap-2">
                  <input
                    id="primaryColor"
                    type="color"
                    value={primary}
                    onChange={(e) => setPrimary(e.target.value)}
                    className="h-9 w-14 cursor-pointer rounded-lg border border-input"
                  />
                  <code className="text-xs text-muted-foreground">{primary}</code>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="accentColor">Accent Color</Label>
                <div className="flex items-center gap-2">
                  <input
                    id="accentColor"
                    type="color"
                    value={accent}
                    onChange={(e) => setAccent(e.target.value)}
                    className="h-9 w-14 cursor-pointer rounded-lg border border-input"
                  />
                  <code className="text-xs text-muted-foreground">{accent}</code>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Presets</Label>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <Button
                    key={p.name}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setPrimary(p.primary)
                      setAccent(p.accent)
                    }}
                  >
                    <span className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: p.primary }} />
                    <span className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: p.accent }} />
                    {p.name}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pdf1">Print Header Line 1</Label>
              <Input id="pdf1" value={pdfHeader1} onChange={(e) => setPdfHeader1(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pdf2">
                Print Header Line 2 <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input id="pdf2" value={pdfHeader2} onChange={(e) => setPdfHeader2(e.target.value)} />
            </div>

            <label className="flex items-start gap-3 rounded-lg border border-border p-3">
              <Checkbox
                checked={selfSignup}
                onCheckedChange={(v) => setSelfSignup(v === true)}
                className="mt-0.5"
              />
              <span className="text-sm">
                <span className="font-medium">Allow photographer self-signup</span>
                <br />
                <span className="text-muted-foreground">
                  When off, photographers can only be assigned to events by an admin.
                </span>
              </span>
            </label>

            <Button type="submit" size="lg" disabled={busy} className="w-full">
              {busy ? 'Saving…' : saved ? 'Saved ✓' : 'Save Branding'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
