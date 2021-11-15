import Queue from 'queue-promise'
import moment from 'moment'
import { gql, request } from 'graphql-request'
import { Order, GraphOrderEntity, BlockData } from '../types'
import db from './db'
import { getAmountForToken } from '../api'
import { MATE_CORE_ADDRESS, OrderStatus } from '../config'
import { getStandardProvider } from '../providers'
import { ethers } from 'ethers'
import mateCoreAbi from '../abi/MateCore.json'

export const setupEvents = () => {
  const mateCore = new ethers.Contract(
    MATE_CORE_ADDRESS,
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

      await getOrderWithData(newOrder)

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
      console.log(`Order executed - ${orderId}`)

      const order = db.data.orders.find(
        (currentOrder) => currentOrder.id === order.id
      )

      if (order) {
        const executedBlockNumber = event.blockNumber

        const updatedOrder = {
          ...order,
          status: OrderStatus.CLOSED,
          recievedAmount: amountOut.toString(),
          executedBlockNumber,
          executedTimestamp: timestamp,
        }

        const executedBlock = await getAmountBlock(
          updatedOrder,
          order.executedBlockNumber,
          undefined
        )

        updateOrder(orderId, {
          ...updatedOrder,
          executedBlock,
        })
      } else {
        batchUpdates()
      }
    }
  )
}

export const orderQueue = new Queue({
  concurrent: 2,
  interval: 2000,
})

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

export const getAmountBlock = async (
  order: GraphOrderEntity,
  blockNumber: string | void,
  currentBlock: BlockData | undefined,
  ignoreField?: string
): Promise<BlockData | null> => {
  if (!blockNumber) {
    return null
  }

  let amountIn = currentBlock?.amounts.amountIn
  let amountOutMin = currentBlock?.amounts.amountOutMin
  let recieved = currentBlock?.amounts.recieved
  let tokenIn = currentBlock?.prices.tokenIn
  let tokenOut = currentBlock?.prices.tokenOut

  if (!amountIn) {
    const result = await getAmountForToken({
      token: order.tokenIn,
      blockNumber: blockNumber,
      amount: order.amountIn,
    })
    if (ignoreField !== 'amountIn') {
      amountIn = result.amount
    }
    tokenIn = result.price
  }

  if (!amountOutMin && ignoreField !== 'amountOutMin') {
    const result = await getAmountForToken({
      token: order.tokenOut,
      blockNumber: blockNumber,
      amount: order.amountOutMin,
    })
    amountOutMin = result.amount
    tokenOut = result.price
  }

  if (order.recievedAmount && !recieved && ignoreField !== 'recieved') {
    const result = await getAmountForToken({
      token: order.tokenOut,
      blockNumber: blockNumber,
      amount: order.recievedAmount,
    })
    recieved = result.amount
  }

  return {
    amounts: {
      amountIn,
      amountOutMin,
      recieved,
    },
    prices: {
      tokenIn,
      tokenOut,
    },
  }
}

const getOrderWithData = async (order: GraphOrderEntity) => {
  try {
    const currentOrders = db.data.orders || []
    const selectedOrder = currentOrders.find(
      (currentOrder) => currentOrder.id === order.id
    )

    const [createdBlock, executedBlock] = await Promise.all([
      getAmountBlock(
        order,
        order.createdBlockNumber,
        selectedOrder?.createdBlock,
        'recieved'
      ),
      getAmountBlock(
        order,
        order.executedBlockNumber,
        selectedOrder?.executedBlock,
        'amountIn'
      ),
    ])

    const updated = {
      createdBlock,
      executedBlock,
    }

    const updatedOrder = selectedOrder
      ? {
          ...selectedOrder,
          ...order,
          ...updated,
        }
      : {
          ...order,
          ...updated,
        }

    if (selectedOrder) {
      await updateOrder(order.id, updatedOrder)
    } else {
      db.data.orders.push(updatedOrder)
      await db.write()
    }
  } catch (e) {
    console.error(`getOrderWithData failed with order ${order.id}`, e)
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

  allOrders.map((order) => {
    orderQueue.enqueue(() => getOrderWithData(order))
  })
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
