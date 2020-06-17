import { promises as fs } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const tree = async function * (p) {
  for (const entity of await fs.readdir(p, { withFileTypes: true })) {
    const filename = join(p, entity.name)
    if (entity.isFile()) yield filename
    if (entity.isDirectory()) yield * tree(filename)
  }
}

export default tree
