import { model, Schema, Model, Document, SchemaTypes } from 'mongoose'
import { OrderStatus } from '../config'

export type Order = {}
export interface IOrder extends Document {
  id: string
  createdTimestamp: string
  executedTimestamp?: string
  canceledTimestamp?: string
  creator: string
  tokenIn: string
  tokenOut: string
  amountIn: string
  amountOutMin: string
  recievedAmount?: string
  status: OrderStatus
  createdBlockNumber: string
  canceledBlockNumber?: string
  executedBlockNumber?: string
  createdBlock: any
  executedBlock: any
  //   createdBlock?: BlockData
  //   executedBlock?: BlockData
  executedTransactionHash?: string
  createdTransactionHash: string
  amountOutMinUsdValue?: string
  amountInUsdValue?: string
  amountReceivedUsdValue?: string
  savedPercentage?: string
  savedUsd?: string
  isIgnored: boolean
}

const OrderSchema: Schema = new Schema({
  id: { type: String, required: true },
  createdTimestamp: { type: String, required: true },
  executedTimestamp: { type: String, required: false },
  canceledTimestamp: { type: String, required: false },
  creator: { type: String, required: true },
  tokenIn: { type: String, required: true },
  tokenOut: { type: String, required: true },
  amountIn: { type: String, required: true },
  amountOutMin: { type: String, required: true },
  recievedAmount: { type: String, required: false },
  status: { type: String, required: true },
  createdBlockNumber: { type: String, required: true },
  executedBlockNumber: { type: String, required: false },
  canceledBlockNumber: { type: String, required: false },
  createdTransactionHash: { type: String, required: true },
  executedTransactionHash: { type: String, required: false },
  amountOutMinUsdValue: { type: String, required: false },
  amountInUsdValue: { type: String, required: false },
  amountReceivedUsdValue: { type: String, required: false },
  savedPercentage: { type: String, required: false },
  savedUsd: { type: String, required: false },

  createdBlock: {
    type: SchemaTypes.Mixed,
    required: false,
  },
  executedBlock: {
    type: SchemaTypes.Mixed,
    required: false,
  },

  isIgnored: { type: Boolean, required: false },
})

export const Order: Model<IOrder> = model('Order', OrderSchema)
