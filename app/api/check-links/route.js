export async function POST(request) {
  const body = await request.json()
  const { urls = [] } = body

  if (!urls.length) {
    return Response.json({ results: [] })
  }

  const results = await Promise.all(
    urls.map(async ({ id, url }) => {
      try {
        const res = await fetch(url, {
          method: 'HEAD',
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; FlameLinkChecker/1.0)',
          },
          signal: AbortSignal.timeout(6000),
          redirect: 'follow',
        })
        const isFalsePositive = res.status === 403 || res.status === 405 || res.status === 401
        let broken = res.status >= 400 && !isFalsePositive
        let archivedUrl = null

        if (res.status === 404 || res.status === 410) {
          try {
            const archiveRes = await fetch(`https://archive.org/wayback/available?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(4000) })
            const archiveData = await archiveRes.json()
            if (archiveData?.archived_snapshots?.closest?.url) {
              archivedUrl = archiveData.archived_snapshots.closest.url
            }
          } catch (e) { }
        }

        return { id, status: res.status, broken, archivedUrl }
      } catch {
        return { id, status: 0, broken: true, archivedUrl: null }
      }
    })
  )

  return Response.json({ results })
}
