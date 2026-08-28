/**
 * bookParser — extracts plain-text chapters (plus a cover image, when one
 * can be found) from EPUB and MOBI files picked from the user's device.
 * Runs entirely client-side (no backend, no server round-trip), matching
 * this app's existing architecture.
 *
 * EPUB: a zip container (parsed with JSZip) holding an OPF manifest + spine
 * that lists XHTML files in reading order. We unzip, find the manifest via
 * META-INF/container.xml, then walk the spine converting each XHTML file's
 * body to plain text. Many real-world EPUBs (especially simply-converted
 * ones) don't put one chapter per file — they bundle several chapters, each
 * marked only by an <h1>/<h2>, into a single spine file. Treating each
 * spine file as exactly one chapter silently collapses those into one
 * giant "chapter", so any spine file containing 2+ headings is further
 * split at each heading boundary.
 *
 * MOBI: only the older MOBI6/PalmDOC container is supported. It's a PDB
 * (Palm Database) file whose text records are optionally PalmDOC-LZ77
 * compressed HTML. Newer MOBI files built around KF8 (a nested EPUB-like
 * format) will often fail to extract cleanly here — see the KF8 note below.
 * Given this app has no backend and MOBI has no equivalent lightweight
 * browser-side library, this is a hand-written best-effort parser rather
 * than a full implementation of the format. Cover extraction for MOBI
 * (via its EXTH metadata header) is implemented but unverified against a
 * real-world file with EXTH cover data — it fails silently (cover: null)
 * rather than breaking the rest of the parse if anything about it doesn't
 * match what's expected.
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

/**
 * If `html` contains 2+ top-level headings, split it into one segment per
 * heading (plus a leading untitled segment for any substantial content
 * before the first heading, e.g. an epigraph). Returns null if there are
 * fewer than 2 headings, signalling the caller should treat the whole
 * thing as a single chapter as before.
 */
function splitByHeadings(html) {
  const headingRe = /<h[12]\b[^>]*>([\s\S]*?)<\/h[12]>/gi
  const matches = []
  let m
  while ((m = headingRe.exec(html))) {
    matches.push({ start: m.index, titleHtml: m[1] })
  }
  if (matches.length < 2) return null

  const segments = []
  const leadHtml = html.slice(0, matches[0].start)
  if (htmlToText(leadHtml).length >= 20) segments.push({ title: null, html: leadHtml })

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].start
    const end = i + 1 < matches.length ? matches[i + 1].start : html.length
    const title = decodeEntities(stripTags(matches[i].titleHtml)).trim() || null
    segments.push({ title, html: html.slice(start, end) })
  }
  return segments
}

/** Convert one HTML segment into a { title, text } chapter, dropping a
 *  leading line that just repeats the heading already shown as the title. */
function segmentToChapter(seg, fallbackTitle) {
  let text = htmlToText(seg.html)
  const title = seg.title ?? fallbackTitle
  if (seg.title) {
    const firstLineEnd = text.indexOf('\n\n')
    const firstLine = firstLineEnd === -1 ? text : text.slice(0, firstLineEnd)
    if (firstLine.trim().toLowerCase() === seg.title.trim().toLowerCase()) {
      text = firstLineEnd === -1 ? '' : text.slice(firstLineEnd).replace(/^\n+/, '')
    }
  }
  return { title, text }
}

/** Find a cover image href in the OPF, trying EPUB3, then EPUB2, then a
 *  filename-based guess, in that order. Returns null if none is found. */
function findCoverHref(opfText, manifest) {
  const propMatch = opfText.match(/<item\b([^>]*\bproperties="[^"]*\bcover-image\b[^"]*"[^>]*)>/i)
  if (propMatch) {
    const hrefMatch = propMatch[1].match(/\bhref="([^"]+)"/)
    if (hrefMatch) return hrefMatch[1]
  }
  const metaMatch = opfText.match(/<meta\b[^>]*\bname="cover"[^>]*\bcontent="([^"]+)"/i)
  if (metaMatch && manifest[metaMatch[1]]) return manifest[metaMatch[1]]
  const itemRe = /<(?:opf:)?item\b[^>]*>/gi
  let m
  while ((m = itemRe.exec(opfText))) {
    const tag = m[0]
    if (/\bmedia-type="image\//i.test(tag) && /cover/i.test(tag)) {
      const hrefMatch = tag.match(/\bhref="([^"]+)"/)
      if (hrefMatch) return hrefMatch[1]
    }
  }
  return null
}

const IMAGE_MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' }

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
  // Some producers namespace-prefix these as <opf:item>.
  const manifest = {}
  const idFirstRe = /<(?:opf:)?item\b[^>]*\bid="([^"]+)"[^>]*\bhref="([^"]+)"/g
  let m1
  while ((m1 = idFirstRe.exec(opfText))) manifest[m1[1]] = m1[2]
  const hrefFirstRe = /<(?:opf:)?item\b[^>]*\bhref="([^"]+)"[^>]*\bid="([^"]+)"/g
  let m2
  while ((m2 = hrefFirstRe.exec(opfText))) {
    if (!manifest[m2[2]]) manifest[m2[2]] = m2[1]
  }

  const spineIds = []
  const spineRe = /<(?:opf:)?itemref\b[^>]*\bidref="([^"]+)"[^>]*>/g
  let sm
  while ((sm = spineRe.exec(opfText))) {
    // Skip non-linear items (covers, ads, etc. explicitly marked as not
    // part of the main reading order) — the same convention e-readers follow.
    if (/\blinear="no"/i.test(sm[0])) continue
    const idMatch = sm[0].match(/\bidref="([^"]+)"/)
    if (idMatch) spineIds.push(idMatch[1])
  }

  const titleMatch = opfText.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i)
  const bookTitle = titleMatch ? decodeEntities(stripTags(titleMatch[1])).trim() : 'Untitled book'

  let cover = null
  const coverHref = findCoverHref(opfText, manifest)
  if (coverHref) {
    const decoded = decodeURIComponent(coverHref)
    const candidates = [opfDir + coverHref, opfDir + decoded, coverHref, decoded]
    const coverFile = candidates.map(p => zip.file(p)).find(Boolean)
    if (coverFile) {
      try {
        const ext = coverHref.split('.').pop().toLowerCase()
        const mime = IMAGE_MIME[ext] || 'image/jpeg'
        const base64 = await coverFile.async('base64')
        cover = `data:${mime};base64,${base64}`
      } catch { /* cover is a nice-to-have — never fail the whole parse over it */ }
    }
  }

  const chapters = []
  for (const id of spineIds) {
    const href = manifest[id]
    if (!href) continue
    const decodedHref = decodeURIComponent(href)
    const candidates = [opfDir + href, opfDir + decodedHref, href, decodedHref]
    const file = candidates.map(p => zip.file(p)).find(Boolean)
    if (!file) continue

    const html = await file.async('string')
    const segments = splitByHeadings(html) ?? [{ title: firstHeading(html), html }]
    for (const seg of segments) {
      const chap = segmentToChapter(seg, `Chapter ${chapters.length + 1}`)
      if (chap.text.length < 20) continue
      chapters.push(chap)
    }
  }

  if (chapters.length === 0) throw new Error('No readable text found in this EPUB.')
  return { title: bookTitle, cover, chapters }
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

/** Best-effort cover image extraction from a MOBI's EXTH metadata header.
 *  Unverified against a real-world file — returns null on anything
 *  unexpected rather than risking a wrong or corrupt image. */
function readMobiCover(view, bytes, mobiHeaderStart, recordOffsets) {
  try {
    const exthFlags = view.getUint32(mobiHeaderStart + 128)
    if (!(exthFlags & 0x40)) return null // bit 6: EXTH header present
    const headerLength = view.getUint32(mobiHeaderStart + 4)
    const exthStart = mobiHeaderStart + headerLength
    if (view.getUint32(exthStart) !== 0x45585448) return null // 'EXTH' magic
    const recordCount = view.getUint32(exthStart + 8)

    let pos = exthStart + 12
    let coverImageIndex = null
    for (let i = 0; i < recordCount; i++) {
      const type = view.getUint32(pos)
      const length = view.getUint32(pos + 4)
      if (type === 201 && length === 12) coverImageIndex = view.getUint32(pos + 8) // EXTH 201 = CoverOffset
      pos += length
    }
    if (coverImageIndex == null) return null

    const firstImageIndex = view.getUint32(mobiHeaderStart + 108)
    const imageRecordIndex = firstImageIndex + coverImageIndex
    if (!(imageRecordIndex > 0) || imageRecordIndex >= recordOffsets.length) return null

    const start = recordOffsets[imageRecordIndex]
    const end = imageRecordIndex + 1 < recordOffsets.length ? recordOffsets[imageRecordIndex + 1] : bytes.length
    const imgBytes = bytes.slice(start, end)
    if (imgBytes.length < 8) return null

    // Sniff format from magic bytes rather than trusting a header field.
    let mime = null
    if (imgBytes[0] === 0xff && imgBytes[1] === 0xd8) mime = 'image/jpeg'
    else if (imgBytes[0] === 0x89 && imgBytes[1] === 0x50) mime = 'image/png'
    else if (imgBytes[0] === 0x47 && imgBytes[1] === 0x49) mime = 'image/gif'
    if (!mime) return null

    let binary = ''
    for (let i = 0; i < imgBytes.length; i++) binary += String.fromCharCode(imgBytes[i])
    return `data:${mime};base64,${btoa(binary)}`
  } catch {
    return null // cover is a nice-to-have — never fail the parse over it
  }
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
  const mobiHeaderStart = record0Start + 16             // MOBI header follows the 16-byte PalmDOC header

  // 'Text encoding' sits at offset 12 within the MOBI header (65001 = UTF-8,
  // 1252 = Windows-1252/CP1252 — the two values actually seen in the wild).
  let encoding = 65001
  try {
    encoding = view.getUint32(mobiHeaderStart + 12)
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

  // Full book title, from the MOBI header's "full name" offset/length
  // (relative to the start of record 0). Sanity-checked since this is
  // unverified against a real file with real values here — fall back to
  // the first heading, then a generic title, if anything looks off.
  let title = null
  try {
    const nameOffset = view.getUint32(mobiHeaderStart + 96)
    const nameLength = view.getUint32(mobiHeaderStart + 100)
    if (nameLength > 0 && nameLength < 500 && record0Start + nameOffset + nameLength <= bytes.length) {
      const nameBytes = bytes.slice(record0Start + nameOffset, record0Start + nameOffset + nameLength)
      const candidate = decoder.decode(nameBytes).trim()
      if (candidate && /[\p{L}\p{N}]/u.test(candidate)) title = candidate
    }
  } catch { /* fall through to heading-based title below */ }

  const cover = readMobiCover(view, bytes, mobiHeaderStart, recordOffsets)

  const segments = splitByHeadings(raw) ?? [{ title: firstHeading(raw), html: raw }]
  const chapters = segments
    .map(seg => segmentToChapter(seg, 'Full text'))
    .filter(c => c.text.length >= 20)

  return {
    title: title ?? firstHeading(raw) ?? 'Untitled book',
    cover,
    chapters: chapters.length > 0 ? chapters : [{ title: 'Full text', text }],
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
