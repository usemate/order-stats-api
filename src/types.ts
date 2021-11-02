import { Moment } from 'moment'
import { OrderStatus } from './config'

type Price = string

export type DataBase = {
  orders: Order[]
}

export type BlockData = {
  prices?: {
    tokenIn?: string
    tokenOut?: string
  }
  amounts?: {
    amountOutMin?: string
    amountIn?: string
    recieved?: string
  }
}

export type GraphOrderEntity = {
  id: string
  createdTimestamp: string
  executedTimestamp?: string
  creator: string
  tokenIn: string
  tokenOut: string
  amountIn: string
  amountOutMin: string
  recievedAmount?: string
  status: OrderStatus
  createdBlockNumber: string
  executedBlockNumber?: string

  createdBlock?: BlockData
  executedBlock?: BlockData
}

export type Order = GraphOrderEntity & {
  amountOutMinUsdValue?: Price
  amountInUsdValue?: Price
  amountReceivedUsdValue?: Price
}
