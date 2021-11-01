import { request, gql } from 'graphql-request'
import { Moment } from 'moment'
import axios from 'axios'
import Decimal from 'decimal.js'
import { ethers } from 'ethers'
import { getStandardProvider } from './providers'

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

const tokenPriceQuery = gql`
  query getTokenPrice($token: ID!, $block: Int) {
    token(id: $token, block: { number: $block }) {
      derivedUSD
    }
  }
`

const getPrice = async ({
  token,
  blockNumber,
}: {
  token: string
  blockNumber: string
}): Promise<string | void> => {
  const apiURL =
    'https://bsc.streamingfast.io/subgraphs/name/pancakeswap/exchange-v2'
  // Get price for token with block number
  try {
    const result = await ApiCache.graphqlRequest(apiURL, tokenPriceQuery, {
      block: Number(blockNumber),
      token: token.toLowerCase(),
    })

    if (result.token) {
      return result.token.derivedUSD
    }
  } catch (e) {
    console.error(e)
  }

  // console.error(`Failed getting ${token} at block number ${blockNumber}`)

  // // Fallback to current price
  // try {
  //   const result = await ApiCache.graphqlRequest(apiURL, tokenPriceQuery, {
  //     block: Number(blockNumber),
  //     token,
  //   })

  //   if (result.token) {
  //     return result.token.derivedUSD
  //   }
  // } catch (e) {
  //   console.error(e)
  // }

  // console.error(`Failed getting ${token} at current block number`)
}

export const getAmountForToken = async ({
  token,
  amount,
  blockNumber,
}: {
  token: string
  blockNumber: string
  amount: string
}): Promise<string> => {
  try {
    const price = await getPrice({ token, blockNumber })

    if (!price) {
      return Promise.reject()
    }

    const erc20Token = new ethers.Contract(
      token,
      ['function decimals() public view returns (uint8)'],
      getStandardProvider()
    )
    const decimals = await erc20Token.decimals()
    const value = new Decimal(price).mul(
      ethers.utils.formatUnits(amount, decimals)
    )

    return value.toString()
  } catch (e) {
    console.error({ blockNumber, amount, token })
    console.error('error in getAmountForToken')
    console.error(e.message)
  }
  return Promise.reject()
}
