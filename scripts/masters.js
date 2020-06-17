import sync from '../lib/sync.js'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const run = async () => {
  const [,,owner] = process.argv
  if (!owner) throw new Error('Missing owner argument')
  if (!process.env.GHTOKEN) throw new Error('Missing GHTOKEN env variable')
  const dir = join(__dirname, '..', 'masters')
  await sync(dir, process.env.GHTOKEN, owner)
}
run()
