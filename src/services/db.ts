import { DataBase } from '../types'
import { Low, JSONFile } from 'lowdb'
import path from 'path'

const file = path.join(process.cwd(), 'db/db.json')
const adapter = new JSONFile<DataBase>(file)

export const db = new Low(adapter)

export const initDb = async () => {
  await db.read()

  const gotOrders = Boolean(db.data?.orders)
  if (!gotOrders) {
    db.data = { orders: [] }
  }

  await db.write()

  return db
}

export default db
