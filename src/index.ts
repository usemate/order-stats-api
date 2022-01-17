import Decimal from 'decimal.js'
import { config } from 'dotenv'
import { ethers } from 'ethers'
import express, { Request, Response } from 'express'
import { OrderStatus } from './config'
import { initDb } from './services/db'
import {
  batchUpdates,
  getAverageOrderSize,
  getBiggestOpenOrder,
  getBiggestSavesPercentage,
  getBiggestSaveUsd,
  getExecutedOrders,
  getLargestOrder,
  getLatestUpdatedOrders,
  orderIsValid,
  orderQueue,
  setupEvents,
} from './services/orders'
import { CronJob } from 'cron'
import Moralis from 'moralis/node'
import { amountIsCorrect } from './utils'
import bodyParser from 'body-parser'
import banish from './services/banish'
import { Order } from './models/Order'

const db: any = {}
// https://mikemcl.github.io/decimal.js/#Dset
Decimal.set({
  toExpNeg: -40,
  precision: 50,
})

config()

const start = async () => {
  console.log('Starting app')
  console.log('Loading db')
  await initDb()

  await Moralis.start({
    serverUrl: process.env.MORALIS_SERVER_URL,
    appId: process.env.MORALIS_APP_ID,
  })

  console.log('Init express')
  const app = express()
  const port = process.env.PORT || 2022

  setupEvents()
  batchUpdates()

  app.use(bodyParser.json())

  app.get('/orders', async (req: Request, res: Response) => {
    const orders = await Order.find({})
    res.status(200).send(orders)
  })

  app.get('/batch', async (req: Request, res: Response) => {
    try {
      batchUpdates()
      res.status(200).send('Batch started')
    } catch (e) {
      res.status(500).send(e.message)
    }
  })

  app.get('/queue', async (req: Request, res: Response) => {
    try {
      res.status(200).json({
        state: orderQueue.state,
        size: orderQueue.size,

        isEmpty: orderQueue.isEmpty,
        shouldRun: orderQueue.shouldRun,
      })
    } catch (e) {
      res.status(500).send(e.message)
    }
  })

  app.get('/executed', async (req: Request, res: Response) => {
    const orders = await getExecutedOrders()
    res.status(200).send(orders)
  })

  const job = new CronJob(
    '0 8 * * *',
    async () => {
      console.log('Cron job triggered')
      batchUpdates()
    },
    null,
    true,
    'Europe/Berlin'
  )

  job.start()

  app.get('/stats', async (req: Request, res: Response) => {
    try {
      const orders = await Order.find({})
      const averageOrderSize = await getAverageOrderSize()
      const openOrders = orders.filter(
        (order) => order.status === OrderStatus.OPEN
      )
      const executedOrders = await getExecutedOrders()

      const executedOrdersLocked = executedOrders
        .map((order) => order.createdBlock.amounts.amountIn)
        .reduce((prev, curr) => prev.add(new Decimal(curr)), new Decimal(0))

      const amountOutMinAmount = executedOrders
        .map((order) => order.createdBlock.amounts.amountOutMin)
        .reduce((prev, curr) => prev.add(new Decimal(curr)), new Decimal(0))

      const recievedAmount = executedOrders
        .map((order) => order.executedBlock.amounts.recieved)
        .reduce((prev, curr) => prev.add(new Decimal(curr)), new Decimal(0))

      const totalOrdersValid = orders
        .filter((order) => orderIsValid(order, orders))
        .filter((order) =>
          amountIsCorrect(order.createdBlock?.amounts?.amountIn)
        )

      const totalLocked = totalOrdersValid
        .map((order) => order.createdBlock?.amounts?.amountIn)
        .reduce((prev, curr) => prev.add(new Decimal(curr)), new Decimal(0))
        .toDecimalPlaces(6)

      const openOrdersValid = openOrders
        .filter((order) => orderIsValid(order, orders))
        .filter((order) =>
          amountIsCorrect(order.createdBlock?.amounts?.amountIn)
        )

      const currentlyLocked = openOrdersValid
        .map((order) => order.createdBlock?.amounts?.amountIn)
        .reduce((prev, curr) => prev.add(new Decimal(curr)), new Decimal(0))
        .toDecimalPlaces(6)

      const defects = {
        executedOrdersIgnored:
          orders.filter((order) => order.status === OrderStatus.CLOSED).length -
          executedOrders.length,
        openOrdersIgnored: openOrders.length - openOrdersValid.length,
        totalOrdersIgnored: orders.length - totalOrdersValid.length,
      }

      const canceledOrders = orders.filter(
        (order) => order.status === OrderStatus.CANCELED
      )
      const amountOutMinTotal = executedOrders
        .map((order) => ethers.utils.formatUnits(order.amountOutMin))
        .reduce((prev, curr) => prev.add(new Decimal(curr)), new Decimal(0))

      const recievedAmountTotal = executedOrders
        .map((order) => ethers.utils.formatUnits(order.recievedAmount))
        .reduce((prev, curr) => prev.add(new Decimal(curr)), new Decimal(0))

      res.status(200).json({
        orderCount: orders.length,
        openOrderCount: openOrders.length,
        defects,
        executedOrderCount: executedOrders.length,
        canceledOrderCount: canceledOrders.length,
        expiredOrdersCount:
          orders.length -
          openOrders.length -
          executedOrders.length -
          canceledOrders.length,
        currentlyLocked,
        totalLocked,
        averageOrderSize,
        executed: {
          amountIn: executedOrdersLocked,
          recievedAmount,
          amountOutMinAmount,
          recievedAmountTotal,
          amountOutMinTotal,
          recievedIncreasePercentage: recievedAmountTotal
            .div(amountOutMinTotal)
            .mul(100)
            .sub(100)
            .toDecimalPlaces(4)
            .toString(),
        },
      })
    } catch (e) {
      res.status(500).send(e.message)
    }
  })

  app.get('/orders/:ordersId', async (req: Request, res: Response) => {
    if (!req.params.ordersId) {
      return res.status(500).send('Missing order id')
    }

    try {
      const order = await (db.data?.orders || []).find(
        (order) => order.id.toLowerCase() === req.params.ordersId.toLowerCase()
      )

      if (order) {
        return res.status(200).json({
          order,
        })
      }
    } catch (e) {
      console.error(e)
    }

    return res.status(500).send(`Can't find order ${req.params.ordersId}`)
  })

  app.get('/tokens', (req: Request, res: Response) => {
    try {
      const tokens = {}

      for (let order of db.data.orders) {
        const initToken = {
          count: {
            in: 0,
            out: 0,
          },
        }

        const tokenIn = order.tokenIn.toLowerCase()
        const tokenOut = order.tokenOut.toLowerCase()

        if (!tokens[tokenIn]) {
          tokens[tokenIn] = { ...initToken }
        }

        if (!tokens[tokenOut]) {
          tokens[tokenOut] = { ...initToken }
        }

        tokens[tokenIn].count.in++
        tokens[tokenOut].count.out++

        // if (order.createdBlock?.amounts.amountIn) {
        //   tokens[tokenIn].amountIn = tokens[tokenIn].amountIn
        //     ? new Decimal(0).add(order.createdBlock?.amounts.amountIn)
        //     : tokens[tokenIn].amountIn.add(order.createdBlock?.amounts.amountIn)
        // }

        // if (order.createdBlock?.amounts.amountOutMin) {
        //   tokens[tokenOut].amountOut = tokens[tokenOut].amountOut
        //     ? new Decimal(0).add(order.createdBlock?.amounts.amountOutMin)
        //     : tokens[tokenOut].amountOut.add(
        //         order.createdBlock?.amounts.amountOutMin
        //       )
        // }
      }

      res.status(200).json({
        tokens,
      })
    } catch (e) {
      return res.status(500).send(e.message)
    }
  })

  app.get('/leaderboard', async (req: Request, res: Response) => {
    try {
      const largestOrder = await getLargestOrder()
      const biggestPercentageSaved = await getBiggestSavesPercentage()
      const biggestSaveUsd = await getBiggestSaveUsd()
      const biggestOpenOrders = await getBiggestOpenOrder()

      res.status(200).json({
        largestOrder,
        biggestPercentageSaved,
        biggestSaveUsd,
        biggestOpenOrders,
      })
    } catch (e) {
      console.error(e)
      res.status(500).send(e.message)
    }
  })

  app.get('/latest', async (req: Request, res: Response) => {
    try {
      const orders = await getLatestUpdatedOrders()

      res.status(200).json({
        orders,
      })
    } catch (e) {
      console.error(e)
      res.status(500).send(e.message)
    }
  })

  app.get('/defects', async (req: Request, res: Response) => {
    const executedOrders = await getExecutedOrders()
    const executedOrdersIds = executedOrders.map((order) => order.id)
    const orders = (await db.data?.orders) || []

    const selectedOrders = orders
      .filter((order) => order.status === OrderStatus.CLOSED)
      .filter((order) => !executedOrdersIds.includes(order.id))

    res.status(200).json({
      ordersWithoutPrice: selectedOrders,
    })
  })

  app.get('/banish', async (req: Request, res: Response) => {
    const orders = await Order.find({ isIgnored: true }).lean().exec()

    res.status(200).json({
      ignoredTokens: banish.tokens,
      ignoredOrders: orders,
    })
  })
  app.post('/whitelist-token', async (req: Request, res: Response) => {
    try {
      if (req.query?.token) {
        banish.removeToken(req.query.token as string)
      }

      return res.status(200).send('ok')
    } catch (e) {
      console.error(e)
    }
    res.status(500).send('error')
  })

  app.post('/whitelist-order', async (req: Request, res: Response) => {
    try {
      if (req.query?.order) {
        banish.removeOrder(req.query.order as string)
      }

      return res.status(200).send('ok')
    } catch (e) {
      console.error(e)
    }
    res.status(500).send('error')
  })
  app.post('/delist-token', async (req: Request, res: Response) => {
    try {
      if (req.query?.token) {
        banish.addToken(req.query.token as string)
      }

      return res.status(200).send('ok')
    } catch (e) {
      console.error(e)
    }
    res.status(500).send('error')
  })
  app.post('/delist-order', async (req: Request, res: Response) => {
    try {
      if (req.query?.order) {
        banish.addOrder(req.query.order as string)
      }

      return res.status(200).send('ok')
    } catch (e) {
      console.error(e)
    }
    res.status(500).send('error')
  })

  // app.get('/top-users', async (req: Request, res: Response) => {
  //   const order = await getLargestOrder()

  //   res.status(200).send(order)
  // })

  // start the express server
  app.listen(port, () => {
    // tslint:disable-next-line:no-console
    console.log(`server started at http://localhost:${port}`)
  })
}

start()
