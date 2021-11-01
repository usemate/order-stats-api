import moment from 'moment'
import { gql, request } from 'graphql-request'
import { Order, GraphOrderEntity, OrderWithDate } from '../types'
import db from './db'
import { getAmountForToken } from '../api'
import { OrderStatus } from '../config'
import { getStandardProvider } from '../providers'
import { ethers } from 'ethers'
import mateCoreAbi from '../abi/MateCore.json'

export const setupEvents = () => {
  const mateCore = new ethers.Contract(
    process.env.MATE_CORE,
    mateCoreAbi.abi,
    getStandardProvider()
  )

  mateCore.on(
    'OrderPlaced',
    async (
      id,
      tokenIn,
      tokenOut,
      amountIn,
      amountOutMin,
      recipient,
      creator,
      expiration,
      createdTimestamp,
      event
    ) => {
      console.log(`Order placed - ${id}`)

      const newOrder: GraphOrderEntity = {
        id,
        createdTimestamp: createdTimestamp.toString(),
        status: OrderStatus.OPEN,
        creator,
        tokenIn,
        tokenOut,
        amountIn: amountIn.toString(),
        amountOutMin: amountOutMin.toString(),
        createdBlockNumber: event.blockNumber,
      }
      const populatedOrder = await getOrderWithData(newOrder)
      db.data.orders.push(populatedOrder)

      await db.write()
    }
  )

  mateCore.on('OrderCanceled', async (id, timestamp) => {
    console.log(`Order canceled - ${id}`)

    updateOrder(id, {
      status: OrderStatus.CANCELED,
    })
  })

  mateCore.on(
    'OrderExecuted',
    async (orderId, creator, sender, amountOut, timestamp, event) => {
      console.log(`Order placed - ${orderId}`)

      const order = db.data.orders.find(
        (currentOrder) => currentOrder.id === order.id
      )

      if (order) {
        const executedBlockNumber = event.blockNumber
        const amountReceivedUsdValue = await getAmountForToken({
          token: order.tokenOut,
          blockNumber: executedBlockNumber,
          amount: amountOut.toString(),
        })

        updateOrder(orderId, {
          status: OrderStatus.CLOSED,
          recievedAmount: amountOut.toString(),
          amountReceivedUsdValue: amountReceivedUsdValue,
          executedBlockNumber,
          executedTimestamp: timestamp,
        })
      } else {
        batchUpdates()
      }
    }
  )
}

const ordersQuery = gql`
  query getOrders($skip: Int, $first: Int) {
    orders(first: $first, skip: $skip) {
      id
      createdTimestamp
      executedTimestamp
      status
      creator
      tokenIn
      tokenOut
      amountIn
      amountOutMin
      recievedAmount
      createdBlockNumber
      executedBlockNumber
    }
  }
`

const getOrderWithData = async (order: GraphOrderEntity) => {
  try {
    const currentOrders = db.data.orders || []
    const selectedOrder = currentOrders.find(
      (currentOrder) => currentOrder.id === order.id
    )

    let amountInUsdValue = selectedOrder?.amountInUsdValue
    let amountReceivedUsdValue = selectedOrder?.amountReceivedUsdValue
    let amountOutMinUsdValue = selectedOrder?.amountOutMinUsdValue

    if (!amountInUsdValue) {
      amountInUsdValue = await getAmountForToken({
        token: order.tokenIn,
        blockNumber: order.createdBlockNumber,
        amount: order.amountIn,
      })
    }

    if (!amountOutMinUsdValue) {
      amountOutMinUsdValue = await getAmountForToken({
        token: order.tokenOut,
        blockNumber: order.createdBlockNumber,
        amount: order.amountOutMin,
      })
    }

    if (order.executedBlockNumber && !amountReceivedUsdValue) {
      amountReceivedUsdValue = await getAmountForToken({
        token: order.tokenOut,
        blockNumber: order.executedBlockNumber,
        amount: order.recievedAmount,
      })
    }

    return selectedOrder
      ? {
          ...selectedOrder,
          ...order,
          amountInUsdValue,
          amountReceivedUsdValue,
          amountOutMinUsdValue,
        }
      : {
          ...order,
          amountInUsdValue,
          amountReceivedUsdValue,
          amountOutMinUsdValue,
        }
  } catch (e) {
    console.error(e)

    return order
  }
}

export const updateOrder = async (orderId: string, data: Partial<Order>) => {
  const currentOrders = db.data.orders || []

  const selectedOrderIndex = currentOrders.findIndex(
    (currentOrder) => currentOrder.id.toLowerCase() === orderId.toLowerCase()
  )

  if (selectedOrderIndex >= 0) {
    db.data.orders[selectedOrderIndex] = {
      ...db.data.orders[selectedOrderIndex],
      ...data,
    }
  }
  await db.write()
}

export const batchUpdates = async () => {
  const allOrders = await getAllOrders()

  const promises = allOrders.map(async (order) => await getOrderWithData(order))

  const orders = await Promise.all(promises)
  db.data.orders = orders

  await db.write()
}

export const getAllOrders = async (): Promise<GraphOrderEntity[]> => {
  let done = false
  let first = 1000
  let skip = 0

  const whileGenerator = function* () {
    while (!done) {
      yield skip
    }
  }

  let orders = []

  try {
    for (let i of whileGenerator()) {
      const result = await request<{ orders: GraphOrderEntity[] }>(
        'https://api.thegraph.com/subgraphs/name/usemate/mate',
        ordersQuery,
        {
          first,
          skip,
        }
      )

      skip += first
      orders = [...orders, ...result.orders]

      if (result.orders.length === 0) {
        done = true
      }
    }
  } catch (e) {
    console.error('Failed getting orders from TheGraph!')
    console.error(e)
  }

  return orders
}
