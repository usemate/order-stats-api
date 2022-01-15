import { connect } from 'mongoose'

export const initDb = async () => {
  await connect(process.env.MONGO_URI || 'mongodb://localhost:27017/orders')
}
