import { promises as fs } from 'fs'
import Diff from 'text-diff'
import client from './client.js'
import tree from './file-tree.js'

const diff = new Diff()

const sync = async (token, owner, files, overwrite = false) => {
  const message = 'fix: upgrade file from globals repo'
  const { repos, ls, cat, putFile } = client(token)
  for await (const repo of repos(owner)) {
    if (repo.private) continue
    const { name } = repo
    for (const [filename, buffer] of Object.entries(files)) {
      const master = buffer.toString()
      const _p = `${owner}/${name}/${filename}`
      let text
      try {
        text = await cat(_p)
      } catch (e) {
        if (e.statusCode !== 404) throw e
        console.log(name, "doesn't have", filename)
        if (!overwrite) continue
      }
      if (master !== text) {
        console.log(name, 'is being updated to latest', filename)
        await putFile(_p, message, buffer, true)
      } else {
        console.log(name, 'is already on latest', filename)
      }
    }
  }
}

const run = async (base, token, owner, overwrite = false) => {
  const files = {}
  for await (const filename of tree(base)) {
    files[filename.slice(base.length + 1)] = await fs.readFile(filename)
  }
  await sync(token, owner, files)
}

export default run
