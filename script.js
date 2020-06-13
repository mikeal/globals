import bent from 'bent'
import qs from 'querystring'
import parser from 'parse-link-header'

const client = token => {
  const headers = {
    authorization: `token ${token}`,
    'user-agent': 'update-actions-0.0.1'
  }
  const get = bent('https://api.github.com', headers)
  const json = async stream => {
    const parts = []
    for await (const chunk of stream) {
      parts.push(chunk)
    }
    return JSON.parse(Buffer.concat(parts).toString())
  }
  const rateLimit = resp => {
    const remaining = parseInt(resp.headers['x-ratelimit-remaining'])
    if (remaining === 0) {
      const reset = parseInt(resp.headers['x-ratelimit-reset'])
      return new Promise(resolve => setTimeout(resolve, reset - (Date.now() + 10000)))
    }
  }
  const u = (path, opts) => `${path}?${qs.stringify(opts)}`

  const getAll = async function * (path, opts = {}) {
    opts.limit = 100
    let resp = await get(u(path, opts))
    await rateLimit(resp)
    let links = parser(resp.headers.link)
    let results = await json(resp)
    yield * results
    while (links && links.next) {
      resp = await (bent(headers)(links.next.url))
      await rateLimit(resp)
      links = parser(resp.headers.link)
      results = await json(resp)
      yield * results
    }
  }
  return { getAll, get, json, headers, rateLimit }
}

const mkgen = fn => async function * (token, ...args) {
  const { getAll } = client(token)
  yield * getAll(fn(...args))
}

const repos = mkgen(user => `/users/${user}/repos`)
const _ls = mkgen(path => {
  const parts = path.split('/').filter(x => x)
  const [ owner, repo, ..._path ] = parts
  path = _path.join('/')
  return `/repos/${owner}/${repo}/contents/${path}`
})

const ls = async function * (token, path, opts) {
  try {
    yield * _ls(token, path)
  } catch (e) {
    if (e.statusCode === 404) {
      if (opts.ignoreMissing) {
        return
      }
      // TODO: proper NotFound error
    }
    throw e
  }
}

const cat = (token, path, branch='master') => {
  const { headers } = client(token)
  const get = bent(`https://raw.githubusercontent.com`, headers, 'string')
  const parts = path.split('/').filter(x => x)
  const [owner, repo, ..._path] = parts
  path = _path.join('/')
  return get(`/${owner}/${repo}/${branch}/${path}`)
}

const run = async token => {
  for await (const { name } of repos(token, 'mikeal')) {
    const opts = { ignoreMissing: true }
    const path = `mikeal/${name}/.github/workflows`
    for await (const { name } of ls(token, path, opts)) {
      const file = path  + '/' + name
      const text = await cat(token, file)
      if (text.includes('mikeal/merge-release')) {
        console.log(file)
      }
    }
  }
}

run(process.env.GHTOKEN)
