import { IOrder, Order } from '../models/Order'

const findIt = (val) => (item) =>
  item && item.toLowerCase() === val && val.toLowerCase()

class Banish {
  tokens: string[] = [
    '0x87230146E138d3F296a9a77e497A2A83012e9Bc5',
    '0x7a565284572d03ec50c35396f7d6001252eb43b6',
    '0x87230146e138d3f296a9a77e497a2a83012e9bc5',
  ]

  addToken = (token: string) => {
    if (!this.tokens.includes(token)) {
      this.tokens.push(token)
    }
  }

  removeToken = (token: string) => {
    this.tokens = this.tokens.filter((t) => t !== token)
  }

  addOrder = async (orderId: string) => {
    const selectedOrder = Order.findOne({ id: orderId })
    if (selectedOrder) {
      await selectedOrder.update({
        isIgnored: true,
      })
    }
  }

  removeOrder = async (orderId: string) => {
    const selectedOrder = Order.findOne({ id: orderId })
    if (selectedOrder) {
      await selectedOrder.update({
        isIgnored: false,
      })
    }
  }

  isTokenIgnored = (token: string): boolean => {
    return this.tokens.some(findIt(token))
  }

  shouldIgnore = ({
    tokenIn,
    tokenOut,
    orderId,
    orders,
  }: {
    tokenIn: string
    tokenOut: string
    orderId: string
    orders: IOrder[]
  }): boolean => {
    if (this.isTokenIgnored(tokenIn)) {
      console.log('bad token in, return ', tokenIn)
      return true
    }

    if (this.isTokenIgnored(tokenOut)) {
      console.log('bad token out, return ', tokenOut)
      return true
    }

    const match = orders.find((order) => order.id === orderId)

    if (!match) {
      return false
    }

    return Boolean(match.isIgnored)
  }
}

export default new Banish()
