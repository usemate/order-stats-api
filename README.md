# Orders api

## Endpoints

### `/stats`

```typescript
type Reponse = {
  orderCount: number
  openOrderCount: number
  executedOrderCount: number
  canceledOrderCount: number
  expiredOrdersCount: number
  currentlyLocked: string
  totalLocked: string
  executed: {
    amountIn: string
    recievedAmount: string
    amountOutMinAmount: string
    recievedAmountTotal: string
    amountOutMinTotal: string
  }
}
```

### `/orders`

```typescript
type Order = {
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
  amountOutMinUsdValue?: string
  amountInUsdValue?: string
  amountReceivedUsdValue?: string
}

type Response = {
  orders: Order[]
}
```

### `/orders/:orderId`

```typescript
type Order = {
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
  amountOutMinUsdValue?: string
  amountInUsdValue?: string
  amountReceivedUsdValue?: string
}

type Response = Order
```

### `/tokens`

```typescript
type Response = {
  tokens: Record<string, TokenStats>
}
```
