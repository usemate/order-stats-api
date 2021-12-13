const findIt = (val) => (item) =>
  item && item.toLowerCase() === val.toLowerCase()

class Banish {
  orders: string[] = []
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

  addOrder = (orderId: string) => {
    if (!this.orders.includes(orderId)) {
      this.orders.push(orderId)
    }
  }

  removeOrder = (orderId: string) => {
    this.orders = this.orders.filter((order) => order !== orderId)
  }

  isTokenIgnored = (token: string): boolean => {
    return this.tokens.some(findIt(token))
  }

  ignore = ({
    tokenIn,
    tokenOut,
    orderId,
  }: {
    tokenIn: string
    tokenOut: string
    orderId: string
  }): boolean => {
    if (this.isTokenIgnored(tokenIn)) {
      console.log('bad token in, return ', tokenIn)
      return false
    }

    if (this.isTokenIgnored(tokenOut)) {
      console.log('bad token out, return ', tokenOut)
      return false
    }

    if (this.orders.some(findIt(orderId))) {
      console.log('bad orderid, return ', orderId)
      return false
    }
  }
}

export default new Banish()
