import { DataBase } from '../types'
import { Low, JSONFile } from 'lowdb'

const adapter = new JSONFile<DataBase>('db.json')

export const db = new Low(adapter)

export const initDb = async () => {
  await db.read()

  if (!db.data) {
    db.data = { orders: [] }
  }

  await db.write()

  return db
}

export default db
