import bent from 'bent'
import qs from 'querystring'
import parser from 'parse-link-header'

const base = token => {
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
  return { getAll, get, json, headers, rateLimit, u }
}

const create = token => {
  const { getAll, headers, u } = base(token)
  const mkgen = fn => async function * (...args) {
    yield * getAll(fn(...args))
  }

  const parse = path => {
    const parts = path.split('/').filter(x => x)
    const [owner, repo, ..._path] = parts
    path = _path.join('/')
    return { path, owner, repo }
  }

  const repos = mkgen(user => `/users/${user}/repos`)
  const _ls = mkgen(_path => {
    const { owner, repo, path } = parse(_path)
    return `/repos/${owner}/${repo}/contents/${path}`
  })

  const ls = async function * (path, opts) {
    try {
      yield * _ls(path)
    } catch (e) {
      if (e.statusCode === 404) {
        if (opts.ignoreMissing) {
          return null
        }
        // TODO: proper NotFound error
      }
      throw e
    }
  }

  const cat = (_path, branch = 'master') => {
    const get = bent('https://raw.githubusercontent.com', headers, 'string')
    const { owner, repo, path } = parse(_path)
    return get(`/${owner}/${repo}/${branch}/${path}`)
  }

  const putFile = async (_path, message, content, sha) => {
    if (Buffer.isBuffer(content)) content = content.toString('base64')
    const opts = { message, content }
    const { owner, repo, path } = parse(_path)
    const u = `/repos/${owner}/${repo}/contents/${path}`
    if (sha === true) {
      const get = bent('https://api.github.com', headers, 'json')
      const resp = await get(u)
      sha = resp.sha
    }
    if (sha) opts.sha = sha
    const put = bent('PUT', 201, 200, 'https://api.github.com', headers, 'json')
    console.log({ opts })
    return put(u, opts)
  }

  const rmFile = async (_path, message, sha) => {
    const { owner, repo, path } = parse(_path)
    const rm = bent('DELETE', 'https://api.github.com', headers, 'json')
    return rm(u(`/repos/${owner}/${repo}/contents/${path}`, { sha, message }))
  }

  return { repos, cat, ls, putFile, rmFile }
}

export default create
