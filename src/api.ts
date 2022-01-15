import { request, gql } from 'graphql-request'
import { Moment } from 'moment'
import axios from 'axios'
import Decimal from 'decimal.js'
import { ethers } from 'ethers'
import { getStandardProvider } from './providers'
import Moralis from 'moralis/node'
import banish from './services/banish'

const ApiCache = {
  caches: {} as Record<string, any>,
  setCache: (cacheKey: string, data: any) => {
    ApiCache.caches[cacheKey] = data
  },

  getCache: (cacheKey: string): any | void => {
    return ApiCache.caches[cacheKey]
  },

  request: async (url: string): Promise<any> => {
    const currentCache = ApiCache.getCache(url)

    if (currentCache) {
      return currentCache
    }

    const { data } = await axios.get(url)

    ApiCache.setCache(url, data)

    return data
  },

  graphqlRequest: async (
    url: string,
    query: string,
    variables: Record<string, string | number>
  ): Promise<any> => {
    const cacheKey = `${url}-${JSON.stringify(variables)}`
    const currentCache = ApiCache.getCache(cacheKey)
    if (currentCache) {
      return currentCache
    }

    const data = await request(url, query, variables)

    ApiCache.setCache(cacheKey, data)

    return data
  },
}

const getPrice = async ({
  token,
  blockNumber,
}: {
  token: string
  blockNumber: string
}): Promise<number | void> => {
  try {
    const result = await Moralis.Web3API.token.getTokenPrice({
      address: token,
      chain: 'bsc',
      to_block: Number(blockNumber),
      exchange: 'PancakeSwapv2',
    })
    if (result.usdPrice) {
      return result.usdPrice
    }
  } catch (e) {
    console.error('getPrice Moralis.Web3API error', e)
  }
}

export const getAmountForToken = async ({
  token,
  amount,
  blockNumber,
}: {
  token: string
  blockNumber: string
  amount: string
}): Promise<{
  amount: string
  price: string
}> => {
  try {
    const price = await getPrice({ token, blockNumber })

    if (!price) {
      return Promise.reject(
        `Could not get price. blockNumber: ${blockNumber}, token: ${token}, amount: ${amount}`
      )
    }

    const erc20Token = new ethers.Contract(
      token,
      [
        'function decimals() public view returns (uint8)',
        'function totalSupply() public view returns (uint256)',
      ],
      getStandardProvider()
    )
    const decimals = await erc20Token.decimals()

    if (banish.isTokenIgnored(token)) {
      return Promise.reject(
        `Token is unstable and is blacklisted. blockNumber: ${blockNumber}, token: ${token}, amount: ${amount}`
      )
    }
    const value = new Decimal(price).mul(
      ethers.utils.formatUnits(amount, decimals)
    )

    return {
      amount: value.toString(),
      price: new Decimal(price).toString(),
    }
  } catch (e) {
    console.error({ blockNumber, amount, token })
    console.error('error in getAmountForToken')
    console.error(e.message)
  }
  return Promise.reject()
}
