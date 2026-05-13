import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const SPORTAPI_HOST = 'sportapi7.p.rapidapi.com'
const RAPIDAPI_KEY  = Deno.env.get('RAPIDAPI_KEY') ?? ''

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  const url    = new URL(req.url)
  const path   = url.searchParams.get('path')

  if (!path || !path.startsWith('/api/')) {
    return new Response(JSON.stringify({ error: 'missing ?path=' }), {
      status: 400,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  if (!RAPIDAPI_KEY) {
    return new Response(JSON.stringify({ error: 'RAPIDAPI_KEY not set' }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  const target = `https://${SPORTAPI_HOST}${path}`

  try {
    const upstream = await fetch(target, {
      headers: {
        'x-rapidapi-host': SPORTAPI_HOST,
        'x-rapidapi-key':  RAPIDAPI_KEY,
      },
    })

    const body = await upstream.text()

    return new Response(body, {
      status:  upstream.status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 502,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
