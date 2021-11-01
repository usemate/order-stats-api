import { ethers } from 'ethers'

export const getStandardProvider = (): ethers.providers.Provider =>
  getMainnetProvider()

export const getMainnetProvider = (): ethers.providers.Provider =>
  new ethers.providers.JsonRpcProvider('https://bsc-dataseed.binance.org')
