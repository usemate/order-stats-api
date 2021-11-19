import Decimal from 'decimal.js'
import { BlockData } from './types'

export const amountIsCorrect = (value: any): boolean => value && value != '0'

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
      .div(recievedAmount)
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
