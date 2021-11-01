import Decimal from 'decimal.js'
import { config } from 'dotenv'
import { ethers } from 'ethers'
import express, { Request, Response } from 'express'
import { OrderStatus } from './config'
import db, { initDb } from './services/db'
import { batchUpdates, setupEvents } from './services/orders'

config()

const start = async () => {
  console.log('Starting app')
  console.log('Loading db')
  await initDb()

  console.log('Init express')
  const app = express()
  const port = process.env.PORT || 5000

  setupEvents()

  const orders = await (db?.data?.orders || [])
  if (orders.length === 0) {
    console.log('No orders found, starting to batch')
    batchUpdates()
  }

  app.get('/orders', async (req: Request, res: Response) => {
    res.status(200).send(db.data?.orders || [])
  })

  app.get('/batch', async (req: Request, res: Response) => {
    try {
      await batchUpdates()
      res.status(200).send('success')
    } catch (e) {
      res.status(500).send(e.message)
    }
  })

  app.get('/stats', async (req: Request, res: Response) => {
    try {
      const orders = db.data?.orders || []
      const openOrders = orders.filter(
        (order) => order.status === OrderStatus.OPEN
      )
      const executedOrders = orders
        .filter((order) => order.status === OrderStatus.CLOSED)
        .filter((order) => order.amountReceivedUsdValue)
        .filter((order) => order.amountOutMinUsdValue)
        .filter((order) => order.amountInUsdValue)

      const executedOrdersLocked = executedOrders
        .map((order) => order.amountInUsdValue)
        .reduce((prev, curr) => prev.add(new Decimal(curr)), new Decimal(0))

      const amountOutMinAmount = executedOrders
        .map((order) => order.amountOutMinUsdValue)
        .reduce((prev, curr) => prev.add(new Decimal(curr)), new Decimal(0))

      const recievedAmount = executedOrders
        .map((order) => order.amountReceivedUsdValue)
        .reduce((prev, curr) => prev.add(new Decimal(curr)), new Decimal(0))

      const totalLocked = orders
        .filter((order) => order.amountInUsdValue)
        .map((order) => order.amountInUsdValue)
        .reduce((prev, curr) => prev.add(new Decimal(curr)), new Decimal(0))

      const currentlyLocked = openOrders
        .filter((order) => order.amountInUsdValue)
        .map((order) => order.amountInUsdValue)
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

  app.get('/orders/:ordersId', async (req, res) => {
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

  // start the express server
  app.listen(port, () => {
    // tslint:disable-next-line:no-console
    console.log(`server started at http://localhost:${port}`)
  })
}

start()
