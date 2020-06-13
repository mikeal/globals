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
          return
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

  const putFile = (_path, message, content, sha) => {
    const opts = { message, content }
    if (sha) opts.sha = sha
    const { owner, repo, path } = parse(_path)
    const put = bent('PUT', 201, 'https://api.github.com', headers, 'json')
    return put(`/repos/${owner}/${repo}/contents/${path}`, opts)
  }

  const rmFile = async (_path, message, sha) => {
    const { owner, repo, path } = parse(_path)
    const rm = bent('DELETE', 'https://api.github.com', headers, 'json')
    return rm(u(`/repos/${owner}/${repo}/contents/${path}`, { sha, message }))
  }

  return { repos, cat, ls, putFile, rmFile }
}

const run = async token => {
  const { repos, cat, ls, putFile, rmFile } = create(token)
  for await (const { name } of repos('mikeal')) {
    const opts = { ignoreMissing: true }
    const path = `mikeal/${name}/.github/workflows`
    for await (const { name, sha } of ls(path, opts)) {
      const file = path + '/' + name
      const text = await cat(file)
      if (text.includes('mikeal/merge-release') && name !== 'mikeals-workflow.yml') {
        console.log({file, sha})
        const message = "build: removing old action"
        const resp = await rmFile(file, message, sha)
        console.log(resp)
        /* mv workflow
        const message = "debug: migrating to new action"
        const content = Buffer.from(text).toString('base64')
        const newfile = path + '/' + 'mikeals-workflow.yml'
        let resp
        try {
        resp = await putFile(newfile, message, content)
        } catch (e) { console.error(e); console.error({e: await e.text()}) }
        console.log(resp)
        */
      }
    }
  }
}

run(process.env.GHTOKEN)
