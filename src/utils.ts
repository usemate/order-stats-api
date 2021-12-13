import Decimal from 'decimal.js'
import { BlockData, Order } from './types'

export const amountIsCorrect = (value: any): boolean => {
  if (!value) {
    return false
  }

  if (value == '0') {
    return false
  }

  if (value.includes('+')) {
    return false
  }

  return true
}

export const getSavedFromOrder = (
  createdBlock: BlockData,
  executedBlock: BlockData
): {
  percentage: string
  amount: string
} => {
  try {
    const amountIn = new Decimal(createdBlock.amounts.amountIn)
    const recievedAmount = new Decimal(executedBlock.amounts.recieved)
    const percentage = recievedAmount
      .sub(amountIn)
      .div(amountIn)
      .mul(100)
      .toDecimalPlaces(5)
      .toString()

    const amount = recievedAmount.sub(amountIn).toString()

    return {
      percentage,
      amount,
    }
  } catch (e) {}
}
