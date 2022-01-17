import Queue from 'queue-promise'
import moment from 'moment'
import { gql, request } from 'graphql-request'
import { GraphOrderEntity, BlockData } from '../types'
import { getAmountForToken } from '../api'
import { MATE_CORE_ADDRESS, OrderStatus } from '../config'
import { getStandardProvider } from '../providers'
import { ethers } from 'ethers'
import mateCoreAbi from '../abi/MateCore.json'
import { amountIsCorrect, getSavedFromOrder } from '../utils'
import Decimal from 'decimal.js'
import banish from './banish'
import { IOrder, Order } from '../models/Order'
import { LeanDocument } from 'mongoose'

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
        createdTransactionHash: event.transactionHash,
      }

      await getOrderWithData(newOrder)
    }
  )

  mateCore.on('OrderCanceled', async (id, timestamp) => {
    console.log(`Order canceled - ${id}`)

    updateOrder(id, {
      status: OrderStatus.CANCELED,
      canceledTimestamp: timestamp,
    })
  })

  mateCore.on(
    'OrderExecuted',
    async (orderId, creator, sender, amountOut, timestamp, event) => {
      console.log(`Order executed - ${orderId}`)
      const order = await Order.findOne({ id: orderId })

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
  concurrent: 1,
  interval: 10000,
})

const ordersQuery = gql`
  query getOrders($lastID: String) {
    orders(first: 1000, where: { id_gt: $lastID }) {
      id
      canceledTimestamp
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
      executedTransactionHash
      createdTransactionHash
    }
  }
`
const getValue = (val?: string) => {
  if (!val) {
    return
  }

  if (val == '0') {
    return
  }

  return val
}

export const getAmountBlock = async (
  order: GraphOrderEntity,
  blockNumber: string | void,
  currentBlock: BlockData | undefined,
  ignoreField?: string
): Promise<BlockData | null> => {
  if (!blockNumber) {
    return null
  }

  let orders = await Order.find({})
  let amountIn = getValue(currentBlock?.amounts.amountIn)
  let amountOutMin = getValue(currentBlock?.amounts.amountOutMin)
  let recieved = getValue(currentBlock?.amounts.recieved)
  let tokenIn = currentBlock?.prices.tokenIn
  let tokenOut = currentBlock?.prices.tokenOut

  if (
    banish.shouldIgnore({
      tokenIn,
      tokenOut,
      orderId: order.id,
      orders,
    })
  ) {
    console.log('getAmountBlock - ignore order: ', order.id)
    return null
  }

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
  let selectedOrder: IOrder
  try {
    selectedOrder = await Order.findOne({ id: order.id })

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

    let updatedOrder: any = selectedOrder
      ? {
          ...order,
          ...updated,
        }
      : {
          ...order,
          ...updated,
        }

    const gotGains = updatedOrder.savedPercentage && updatedOrder.savedUsd
    if (!gotGains && updatedOrder.executedBlock && updatedOrder.createdBlock) {
      const result = getSavedFromOrder(
        updatedOrder.createdBlock,
        updatedOrder.executedBlock
      )
      if (result) {
        updatedOrder = {
          ...updatedOrder,
          savedPercentage: result.percentage,
          savedUsd: result.amount,
        }
      }
    }

    if (selectedOrder) {
      await selectedOrder.updateOne(updatedOrder)
    } else {
      await Order.create(updatedOrder)
    }
  } catch (e) {
    console.error(`getOrderWithData failed with order ${order.id}`, e)
  }
}

export const updateOrder = async (orderId: string, data: Partial<Order>) => {
  const order = await Order.findOne({ id: orderId })
  if (order) {
    await order.update(data)
    console.log('Order updated')
  } else {
    console.error('Could not update order ', orderId)
  }
}

const orderAlreadyPopulated = (
  order: GraphOrderEntity,
  currentOrders: IOrder[]
): boolean => {
  const selectedOrder = currentOrders.find(
    (currentOrder) => currentOrder.id.toLowerCase() === order.id.toLowerCase()
  )

  if (!selectedOrder) {
    return false
  }

  const gotCreatedValues = Boolean(
    getValue(selectedOrder.createdBlock?.amounts.amountIn) &&
      getValue(selectedOrder.createdBlock?.amounts.amountOutMin)
  )

  if (order.status !== 'Closed') {
    return gotCreatedValues
  }

  const populated = Boolean(
    gotCreatedValues &&
      getValue(selectedOrder.executedBlock?.amounts.amountOutMin) &&
      getValue(selectedOrder.executedBlock?.amounts.recieved)
  )

  return populated
}

export const batchUpdates = async () => {
  console.log('batch started, clearing queue')
  orderQueue.clear()
  const allOrders = await getAllOrders()
  const orders = await Order.find({})

  allOrders.map((order) => {
    if (!orderAlreadyPopulated(order, orders)) {
      orderQueue.enqueue(() => getOrderWithData(order))
    }
  })
}

export const getAllOrders = async (): Promise<GraphOrderEntity[]> => {
  let done = false
  let lastID = ''
  const whileGenerator = function* () {
    while (!done) {
      yield lastID
    }
  }

  let orders = []

  try {
    for (let i of whileGenerator()) {
      const result = await request<{ orders: GraphOrderEntity[] }>(
        'https://api.thegraph.com/subgraphs/name/usemate/mate',
        ordersQuery,
        {
          lastID,
        }
      )

      orders = [...orders, ...result.orders]

      if (result.orders.length > 0) {
        lastID = result.orders[result.orders.length - 1].id
      } else if (result.orders.length === 0) {
        done = true
      }
    }
  } catch (e) {
    console.error('Failed getting orders from TheGraph!')
    console.error(e)
  }

  return orders
}

export const getExecutedOrders = async (): Promise<
  LeanDocument<IOrder & { _id: any }>[]
> => {
  const orders = await Order.find({ status: OrderStatus.CLOSED })

  return Promise.all(
    orders
      .filter((order) => orderIsValid(order, orders))
      .filter((order) => order.status === OrderStatus.CLOSED)
      .filter((order) =>
        amountIsCorrect(order.createdBlock?.amounts.amountOutMin)
      )
      .filter((order) => amountIsCorrect(order.createdBlock?.amounts.amountIn))
      .filter((order) => amountIsCorrect(order.executedBlock?.amounts.recieved))
      .map((item) => item.toObject())
  )
}

export const getLargestOrder = async (): Promise<any[]> => {
  const orders = await getExecutedOrders()

  return orders

    .map((order) => ({
      ...order,
      recievedAmount: new Decimal(order.executedBlock.amounts.recieved),
    }))
    .sort((a, b) => b.recievedAmount.comparedTo(a.recievedAmount))
    .slice(0, 15)
    .map((order) => ({
      ...order,
      recievedAmount: order.recievedAmount.toString(),
    }))
}

export const getAverageOrderSize = async (): Promise<number> => {
  const orders = await getExecutedOrders()

  return Math.round(
    orders
      .map((order) =>
        new Decimal(order.executedBlock.amounts.recieved).toNumber()
      )
      .reduce((a, b) => a + b, 0) / orders.length
  )
}

export const getBiggestSavesPercentage = async (): Promise<Order[]> => {
  const orders = await getExecutedOrders()
  return orders
    .filter((order) => order.savedPercentage)
    .map((order) => ({
      ...order,
      savedPercentage: new Decimal(order.savedPercentage),
    }))
    .sort((a, b) => b.savedPercentage.comparedTo(a.savedPercentage))
    .slice(0, 15)
    .map((order) => ({
      ...order,
      savedPercentage: order.savedPercentage.toString(),
    }))
}

export const getBiggestSaveUsd = async (): Promise<Order[]> => {
  const orders = await getExecutedOrders()
  return orders
    .filter((order) => order.savedUsd)
    .map((order) => ({
      ...order,
      savedUsd: new Decimal(order.savedUsd),
    }))
    .sort((a, b) => b.savedUsd.comparedTo(a.savedUsd))
    .slice(0, 15)
    .map((order) => ({
      ...order,
      savedUsd: order.savedUsd.toString(),
    }))
}

export const getBiggestOpenOrder = async (): Promise<Order[]> => {
  const orders = await Order.find({ status: OrderStatus.OPEN })

  return Promise.all(
    orders
      .filter((order) => orderIsValid(order, orders))
      .filter((order) => order.status === OrderStatus.OPEN)
      .filter((order) =>
        amountIsCorrect(order.createdBlock?.amounts.amountOutMin)
      )
      .filter((order) => amountIsCorrect(order.createdBlock?.amounts.amountIn))
      .map((item) => item.toObject())
      .map((order) => ({
        ...order,
        amountInUsd: new Decimal(order.createdBlock.amounts.amountIn),
      }))
      .sort((a, b) => b.amountInUsd.comparedTo(a.amountInUsd))
      .slice(0, 15)
      .map((order) => ({
        ...order,
        amountInUsd: order.amountInUsd.toString(),
      }))
  )
}

export const getLatestUpdatedOrders = async (): Promise<Order[]> => {
  const orders = await Order.find({})

  return orders
    .map((order) => {
      const timestamp =
        order.canceledTimestamp ||
        order.executedTimestamp ||
        order.createdTimestamp

      return {
        ...order,
        date: moment(Number(timestamp) * 1000),
      }
    })
    .sort((a, b) => b.date.diff(a.date))
    .slice(0, 25)
    .map((order) => ({
      ...order,
      date: order.date.format(),
    }))
}

export const orderIsValid = (order: IOrder, orders: IOrder[]): boolean => {
  return !banish.shouldIgnore({
    tokenIn: order.tokenIn,
    tokenOut: order.tokenOut,
    orderId: order.id,
    orders,
  })
}
