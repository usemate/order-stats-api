import { Moment } from 'moment'
import { OrderStatus } from './config'

type Price = string

export type DataBase = {
  orders: Order[]
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
}

export type OrderWithDate = GraphOrderEntity & {
  executed?: Moment
  created: Moment
}

export type Order = GraphOrderEntity & {
  amountOutMinUsdValue?: Price
  amountInUsdValue?: Price
  amountReceivedUsdValue?: Price
}
