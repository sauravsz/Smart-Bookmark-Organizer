export async function POST(request) {
  const body = await request.json()
  const { messages, bookmarks, provider = 'openai' } = body
  let { apiKey } = body
  
  if (!apiKey && provider === 'groq') apiKey = process.env.NEXT_PUBLIC_GROQ_API_KEY
  if (!apiKey && provider === 'openai') apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    return Response.json({ error: 'No API key provided. Add one in Settings or .env.local.' }, { status: 401 })
  }

  if (!messages?.length) {
    return Response.json({ error: 'No messages provided.' }, { status: 400 })
  }

  const recentMessages = messages.slice(-10) // keep only last 10 messages to prevent token limits

  // Build a compact bookmark context (capped to avoid token limits)
  const bookmarkContext = (bookmarks || [])
    .slice(0, 80) // max 80 bookmarks in context
    .map((b, i) =>
      `[${i + 1}] Title: ${b.title || 'Untitled'} | URL: ${b.url} | Category: ${b.category || 'Other'} | Tags: ${(b.tags || []).join(', ')} | Summary: ${b.description?.slice(0, 150) || 'N/A'}`
    )
    .join('\n')

  const systemPrompt = `You are Flame AI, a helpful assistant for a smart bookmark organizer app called Flame Bookmark Organiser.
You have access to the user's saved bookmarks listed below. Answer questions about their collection, suggest bookmarks relevant to their query, find patterns, or help them organize their links.
CRITICAL RULE: Always reference specific bookmarks using Markdown link syntax like this: [Title](URL). This allows the user to click the links directly from your chat response. Be concise and helpful.

USER'S BOOKMARK COLLECTION (${(bookmarks || []).length} total):
${bookmarkContext || 'No bookmarks saved yet.'}

Current time: ${new Date().toISOString()}`

  try {
    let res, data

    if (provider === 'groq') {
      // Groq free tier: 30 RPM, 6,000 TPM
      res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [
            { role: 'system', content: systemPrompt },
            ...recentMessages,
          ],
          temperature: 0.6,
          max_tokens: 500,
        }),
        signal: AbortSignal.timeout(20000),
      })

      data = await res.json()

      if (res.status === 429) {
        const retryAfter = res.headers.get('retry-after') || '60'
        return Response.json(
          { error: 'Rate limit reached. Please wait a moment before asking again.', retryAfter: parseInt(retryAfter, 10) || 60 },
          { status: 429 }
        )
      }
      if (!res.ok) throw new Error(data.error?.message || `Groq error ${res.status}`)
    } else {
      // OpenAI
      res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            ...recentMessages,
          ],
          temperature: 0.6,
          max_tokens: 500,
        }),
        signal: AbortSignal.timeout(20000),
      })

      data = await res.json()

      if (res.status === 429) {
        const retryAfter = res.headers.get('retry-after') || '60'
        return Response.json(
          { error: 'Rate limit reached. Please wait a moment.', retryAfter: parseInt(retryAfter, 10) || 60 },
          { status: 429 }
        )
      }
      if (!res.ok) throw new Error(data.error?.message || `OpenAI error ${res.status}`)
    }

    const reply = data.choices?.[0]?.message?.content
    if (!reply) throw new Error('Empty response from AI')

    return Response.json({ reply })
  } catch (error) {
    if (error.name === 'TimeoutError') {
      return Response.json({ error: 'Chat response timed out. Please try again.' }, { status: 504 })
    }
    return Response.json({ error: error.message || 'Chat failed' }, { status: 500 })
  }
}
