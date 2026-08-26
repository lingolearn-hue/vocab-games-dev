/**
 * bookParser — extracts plain-text chapters from EPUB and MOBI files picked
 * from the user's device. Runs entirely client-side (no backend, no server
 * round-trip), matching this app's existing architecture.
 *
 * EPUB: a zip container (parsed with JSZip) holding an OPF manifest + spine
 * that lists XHTML files in reading order. We unzip, find the manifest via
 * META-INF/container.xml, then walk the spine converting each XHTML file's
 * body to plain text.
 *
 * MOBI: only the older MOBI6/PalmDOC container is supported. It's a PDB
 * (Palm Database) file whose text records are optionally PalmDOC-LZ77
 * compressed HTML. Newer MOBI files built around KF8 (a nested EPUB-like
 * format) will often fail to extract cleanly here — see the KF8 note below.
 * Given this app has no backend and MOBI has no equivalent lightweight
 * browser-side library, this is a hand-written best-effort parser rather
 * than a full implementation of the format.
 */

function stripTags(s) {
  return s.replace(/<[^>]+>/g, '')
}

function decodeEntities(str) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
  return str.replace(/&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z]+);/g, (full, ent) => {
    if (ent[0] === '#') {
      const code = ent[1].toLowerCase() === 'x' ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : full
    }
    return named[ent.toLowerCase()] ?? full
  })
}

/** Convert a chunk of (X)HTML into plain text, keeping paragraph breaks. */
function htmlToText(html) {
  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
  s = s.replace(/<\/(p|div|h[1-6]|li|br|tr)\s*>/gi, '\n')
  s = s.replace(/<br\s*\/?>/gi, '\n')
  s = stripTags(s)
  s = decodeEntities(s)
  return s
    .split('\n')
    .map(line => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n')
}

function firstHeading(html) {
  const m = html.match(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/i)
  return m ? decodeEntities(stripTags(m[1])).trim() : null
}

// ── EPUB ─────────────────────────────────────────────────────────────────────

export async function parseEpub(arrayBuffer) {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(arrayBuffer)

  const containerFile = zip.file('META-INF/container.xml')
  if (!containerFile) throw new Error('Not a valid EPUB (missing META-INF/container.xml).')
  const containerXml = await containerFile.async('string')
  const opfPath = containerXml.match(/full-path="([^"]+)"/)?.[1]
  if (!opfPath) throw new Error('Could not find the EPUB content file.')

  const opfFile = zip.file(opfPath)
  if (!opfFile) throw new Error('EPUB content file referenced but not found in the archive.')
  const opfText = await opfFile.async('string')
  const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : ''

  // Manifest: id -> href. Attribute order in <item> varies between EPUB
  // producers, so match both id-then-href and href-then-id explicitly.
  const manifest = {}
  const idFirstRe = /<item\b[^>]*\bid="([^"]+)"[^>]*\bhref="([^"]+)"/g
  let m1
  while ((m1 = idFirstRe.exec(opfText))) manifest[m1[1]] = m1[2]
  const hrefFirstRe = /<item\b[^>]*\bhref="([^"]+)"[^>]*\bid="([^"]+)"/g
  let m2
  while ((m2 = hrefFirstRe.exec(opfText))) {
    if (!manifest[m2[2]]) manifest[m2[2]] = m2[1]
  }

  const spineIds = []
  const spineRe = /<itemref\b[^>]*\bidref="([^"]+)"/g
  let sm
  while ((sm = spineRe.exec(opfText))) spineIds.push(sm[1])

  const titleMatch = opfText.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i)
  const bookTitle = titleMatch ? decodeEntities(stripTags(titleMatch[1])).trim() : 'Untitled book'

  const chapters = []
  for (const id of spineIds) {
    const href = manifest[id]
    if (!href) continue
    const decodedHref = decodeURIComponent(href)
    const candidates = [opfDir + href, opfDir + decodedHref, href, decodedHref]
    const file = candidates.map(p => zip.file(p)).find(Boolean)
    if (!file) continue

    const html = await file.async('string')
    const text = htmlToText(html)
    if (text.length < 20) continue // skip cover/nav/copyright pages with negligible text

    chapters.push({
      title: firstHeading(html) ?? `Chapter ${chapters.length + 1}`,
      text,
    })
  }

  if (chapters.length === 0) throw new Error('No readable text found in this EPUB.')
  return { title: bookTitle, chapters }
}

// ── MOBI (MOBI6 / PalmDOC container only — see file header note) ──────────────

/** PalmDOC LZ77-style decompression, per the standard PalmDOC algorithm. */
function palmDocDecompress(bytes) {
  const out = []
  let i = 0
  while (i < bytes.length) {
    const c = bytes[i++]
    if (c === 0) {
      out.push(c)
    } else if (c <= 8) {
      for (let j = 0; j < c && i < bytes.length; j++) out.push(bytes[i++])
    } else if (c <= 0x7f) {
      out.push(c)
    } else if (c <= 0xbf) {
      const c2 = bytes[i++]
      const distance = ((c & 0x3f) << 8 | c2) >> 3
      const length = (c2 & 0x07) + 3
      let pos = out.length - distance
      for (let j = 0; j < length; j++) { out.push(out[pos + j] ?? 0x20); pos++ }
    } else {
      out.push(0x20)
      out.push(c ^ 0x80)
    }
  }
  return new Uint8Array(out)
}

export async function parseMobi(arrayBuffer) {
  const view = new DataView(arrayBuffer)
  const bytes = new Uint8Array(arrayBuffer)

  if (bytes.length < 78) throw new Error('Not a valid MOBI file.')
  const numRecords = view.getUint16(76)
  if (numRecords < 1) throw new Error('Not a valid MOBI file (no records).')

  const recordOffsets = []
  for (let i = 0; i < numRecords; i++) {
    recordOffsets.push(view.getUint32(78 + i * 8))
  }

  const record0Start = recordOffsets[0]
  const compression = view.getUint16(record0Start)      // 1 = none, 2 = PalmDOC LZ77
  const textRecordCount = view.getUint16(record0Start + 8)

  // MOBI header follows the 16-byte PalmDOC header inside record 0. The
  // 'encoding' field sits at offset 28 within it (65001 = UTF-8, 1252 =
  // Windows-1252/CP1252, the two formats actually used in the wild).
  let encoding = 65001
  try {
    encoding = view.getUint32(record0Start + 16 + 28)
  } catch { /* fall back to UTF-8 assumption below */ }
  const decoder = new TextDecoder(encoding === 1252 ? 'windows-1252' : 'utf-8')

  let raw = ''
  for (let i = 1; i <= textRecordCount && i < recordOffsets.length; i++) {
    const start = recordOffsets[i]
    const end = i + 1 < recordOffsets.length ? recordOffsets[i + 1] : bytes.length
    const chunk = bytes.slice(start, end)
    const decompressed = compression === 2 ? palmDocDecompress(chunk) : chunk
    raw += decoder.decode(decompressed)
  }

  const text = htmlToText(raw)
  if (text.length < 20) {
    throw new Error(
      'Could not extract text from this MOBI file. It may use the newer ' +
      'KF8 format, which this reader doesn\u2019t support yet — try ' +
      'converting it to EPUB first.'
    )
  }

  return {
    title: firstHeading(raw) ?? 'Untitled book',
    chapters: [{ title: 'Full text', text }],
  }
}

/** Dispatch by file extension. Throws on unsupported types or parse failure. */
export async function parseBookFile(file) {
  const name = file.name.toLowerCase()
  const buf = await file.arrayBuffer()
  if (name.endsWith('.epub')) return parseEpub(buf)
  if (name.endsWith('.mobi') || name.endsWith('.azw') || name.endsWith('.azw3')) return parseMobi(buf)
  throw new Error('Unsupported file type — please choose an .epub or .mobi file.')
}
