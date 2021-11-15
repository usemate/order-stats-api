import Decimal from 'decimal.js'
import { config } from 'dotenv'
import { ethers } from 'ethers'
import express, { Request, Response } from 'express'
import { OrderStatus } from './config'
import db, { initDb } from './services/db'
import { batchUpdates, setupEvents } from './services/orders'
import { CronJob } from 'cron'

config()

const start = async () => {
  console.log('Starting app')
  console.log('Loading db')
  await initDb()

  console.log('Init express')
  const app = express()
  const port = process.env.PORT || 5000

  setupEvents()

  if ((await (db?.data?.orders || []).length) === 0) {
    console.log('No orders found, starting to batch')
    batchUpdates().then(() => console.log('Batching done'))
  }

  app.get('/orders', async (req: Request, res: Response) => {
    res.status(200).send(db.data?.orders || [])
  })

  app.get('/batch', async (req: Request, res: Response) => {
    try {
      batchUpdates()
      res.status(200).send('batch started')
    } catch (e) {
      res.status(500).send(e.message)
    }
  })

  const job = new CronJob(
    '55 * * * *',
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
      const orders = db.data?.orders || []

      const openOrders = orders.filter(
        (order) => order.status === OrderStatus.OPEN
      )
      const executedOrders = orders
        .filter((order) => order.status === OrderStatus.CLOSED)
        .filter((order) => order.createdBlock?.amounts.amountOutMin)
        .filter((order) => order.createdBlock?.amounts.amountIn)
        .filter((order) => order.executedBlock?.amounts.recieved)

      const executedOrdersLocked = executedOrders
        .map((order) => order.createdBlock.amounts.amountIn)
        .reduce((prev, curr) => prev.add(new Decimal(curr)), new Decimal(0))

      const amountOutMinAmount = executedOrders
        .map((order) => order.createdBlock.amounts.amountOutMin)
        .reduce((prev, curr) => prev.add(new Decimal(curr)), new Decimal(0))

      const recievedAmount = executedOrders
        .map((order) => order.executedBlock.amounts.recieved)
        .reduce((prev, curr) => prev.add(new Decimal(curr)), new Decimal(0))

      const totalLocked = orders
        .filter((order) => order.createdBlock?.amounts?.amountIn)
        .map((order) => order.createdBlock?.amounts?.amountIn)
        .reduce((prev, curr) => prev.add(new Decimal(curr)), new Decimal(0))

      const currentlyLocked = openOrders
        .filter((order) => order.createdBlock?.amounts?.amountIn)
        .map((order) => order.createdBlock?.amounts?.amountIn)
        .reduce((prev, curr) => prev.add(new Decimal(curr)), new Decimal(0))

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
        executedOrderCount: executedOrders.length,
        canceledOrderCount: canceledOrders.length,
        expiredOrdersCount:
          orders.length -
          openOrders.length -
          executedOrders.length -
          canceledOrders.length,
        currentlyLocked,
        totalLocked,

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

  // start the express server
  app.listen(port, () => {
    // tslint:disable-next-line:no-console
    console.log(`server started at http://localhost:${port}`)
  })
}

start()
