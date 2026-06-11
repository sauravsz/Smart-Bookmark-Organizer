import * as cheerio from 'cheerio'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const url = searchParams.get('url')
  const tavilyKey = searchParams.get('tavilyKey') || process.env.TAVILY_API_KEY || ''

  if (!url) {
    return Response.json({ error: 'URL is required' }, { status: 400 })
  }

  try {
    new URL(url)
  } catch {
    return Response.json({ error: 'Invalid URL format' }, { status: 400 })
  }

  const domain = new URL(url).hostname
  const favicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`

  // ─── Strategy 1: Tavily Extract (if key provided) ────────────────────────
  if (tavilyKey) {
    try {
      const tavilyRes = await fetch('https://api.tavily.com/extract', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tavilyKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          urls: [url],
          extract_depth: 'basic',
          format: 'markdown',
          include_favicon: true,
          include_images: true,
        }),
        signal: AbortSignal.timeout(12000),
      })

      const tavilyData = await tavilyRes.json()

      if (tavilyRes.ok && tavilyData.results?.length > 0) {
        const result = tavilyData.results[0]
        const rawContent = result.raw_content || ''

        // Extract title from the markdown (first H1 or first line)
        const titleMatch = rawContent.match(/^#\s+(.+)$/m)
        const title = titleMatch?.[1]?.trim() || result.url || domain

        // Extract a clean description: first meaningful paragraph (skip headings/links)
        const paragraphs = rawContent
          .split(/\n{2,}/)
          .map((p) => p.replace(/^#+\s+/, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim())
          .filter((p) => p.length > 40 && !p.startsWith('!'))

        const description = paragraphs[0]?.slice(0, 500) || ''

        // Best image: Tavily images array → og from cheerio fallback
        const ogImage = result.images?.[0] || null

        return Response.json({
          title: title.slice(0, 200),
          description,
          ogImage,
          favicon: result.favicon || favicon,
          domain,
          // Pass the full markdown content for AI to use (capped at 3000 chars)
          pageContent: rawContent.slice(0, 3000),
          source: 'tavily',
        })
      }

      // Tavily returned ok but empty results — fall through to cheerio
    } catch {
      // Tavily failed — fall through to cheerio
    }
  }

  // ─── Strategy 2: Cheerio scrape (fallback / no Tavily key) ───────────────
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      signal: AbortSignal.timeout(8000),
    })

    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    const html = await response.text()
    const $ = cheerio.load(html)

    const title =
      $('meta[property="og:title"]').attr('content') ||
      $('meta[name="twitter:title"]').attr('content') ||
      $('title').text().trim() ||
      domain

    const description =
      $('meta[property="og:description"]').attr('content') ||
      $('meta[name="description"]').attr('content') ||
      $('meta[name="twitter:description"]').attr('content') ||
      ''

    const ogImage =
      $('meta[property="og:image"]').attr('content') ||
      $('meta[name="twitter:image"]').attr('content') ||
      null

    return Response.json({
      title: title.slice(0, 200),
      description: description.slice(0, 500),
      ogImage,
      favicon,
      domain,
      pageContent: description.slice(0, 500),
      source: 'cheerio',
    })
  } catch (error) {
    if (error && error.name === 'TimeoutError') {
      return Response.json({ error: 'Metadata fetch timed out.' }, { status: 504 })
    }
    // ─── Strategy 3: Bare minimum fallback ───────────────────────────────
    return Response.json({
      title: domain,
      description: '',
      ogImage: null,
      favicon,
      domain,
      pageContent: '',
      source: 'fallback',
      warning: 'Could not fetch page content',
    })
  }
}
