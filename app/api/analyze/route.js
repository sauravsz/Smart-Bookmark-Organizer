export async function POST(request) {
  const body = await request.json()
  const { url, title, description, pageContent, provider = 'openai' } = body
  let { apiKey } = body
  
  if (!apiKey && provider === 'groq') apiKey = process.env.NEXT_PUBLIC_GROQ_API_KEY
  if (!apiKey && provider === 'openai') apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    return Response.json({ error: 'No API key provided. Please add one in Settings or .env.local.' }, { status: 401 })
  }

  if (!url) {
    return Response.json({ error: 'URL is required' }, { status: 400 })
  }

  // Build context block — use rich Tavily content when available
  const contextBlock = pageContent && pageContent.length > 100
    ? `Page Content (markdown):
${pageContent.slice(0, 2500)}`
    : `Description: ${description || 'No description available'}`

  const prompt = `You are an intelligent bookmark organizer. Analyze the web page below and return a JSON object.

URL: ${url}
Title: ${title || 'Unknown'}
${contextBlock}

Return ONLY valid JSON in this exact format (no markdown, no code blocks):
{
  "suggested_title": "A concise, descriptive title for the bookmark (if the provided title is generic like 'Home' or 'Index', generate a better one. Otherwise return the original title).",
  "summary": "A clear, 1-2 sentence summary of what this page is about and why someone would save it.",
  "tags": ["Tag1", "Tag2", "Tag3"],
  "category": "One of: Technology, Design, Business, Science, News, Entertainment, Education, Finance, Health, Other"
}

Rules:
- summary must be under 200 characters and based on the actual page content
- tags must be 2–5 items, title case, specific and relevant
- category must be exactly one of the listed options`

  try {
    let res, data

    if (provider === 'groq') {
      // ---- Groq (llama-3.1-8b-instant) ----
      // Free tier: 30 RPM, 6,000 TPM, 14,400 RPD
      res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 300,
        }),
        signal: AbortSignal.timeout(15000),
      })

      data = await res.json()

      // Propagate rate-limit so the client can back off
      if (res.status === 429) {
        const retryAfter = res.headers.get('retry-after') || res.headers.get('x-ratelimit-reset-requests') || '60'
        return Response.json(
          { error: 'Groq rate limit reached', retryAfter: parseInt(retryAfter, 10) || 60 },
          { status: 429 }
        )
      }

      if (!res.ok) throw new Error(data.error?.message || `Groq error ${res.status}`)
    } else {
      // ---- OpenAI (gpt-4o-mini) ----
      res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 300,
          response_format: { type: 'json_object' },
        }),
        signal: AbortSignal.timeout(15000),
      })

      data = await res.json()

      if (res.status === 429) {
        const retryAfter = res.headers.get('retry-after') || '60'
        return Response.json(
          { error: 'OpenAI rate limit reached', retryAfter: parseInt(retryAfter, 10) || 60 },
          { status: 429 }
        )
      }

      if (!res.ok) throw new Error(data.error?.message || `OpenAI error ${res.status}`)
    }

    const content = data.choices?.[0]?.message?.content
    if (!content) throw new Error('Empty response from AI provider')

    // Parse the JSON response
    let parsed
    try {
      parsed = JSON.parse(content)
    } catch {
      // Try extracting JSON from wrapped text
      const match = content.match(/\{[\s\S]*\}/)
      if (!match) throw new Error('Could not parse AI response as JSON')
      parsed = JSON.parse(match[0])
    }

    return Response.json({
      title: parsed.suggested_title || title,
      summary: parsed.summary || '',
      tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 5) : [],
      category: parsed.category || 'Other',
    })
  } catch (error) {
    if (error.name === 'TimeoutError') {
      return Response.json({ error: 'AI analysis timed out. Please try again later.' }, { status: 504 })
    }
    return Response.json(
      { error: error.message || 'AI analysis failed' },
      { status: 500 }
    )
  }
}

