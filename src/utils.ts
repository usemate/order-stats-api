import { getStandardProvider } from './providers'

let averageBlockTime
export const getAverageBlockNumber = async () => {
  const provider = getStandardProvider()
  const currentBlock = await provider.getBlockNumber()

  console.log('--currentBlock', currentBlock)
  const nowBlock = await provider.getBlock(currentBlock)
  const thenBlock = await provider.getBlock(currentBlock - 500)
  averageBlockTime = (nowBlock.timestamp - thenBlock.timestamp) / 500

  console.log(averageBlockTime)
}
