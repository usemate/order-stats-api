import { request, gql } from 'graphql-request'
import { Moment } from 'moment'
import axios from 'axios'
import Decimal from 'decimal.js'
import { ethers } from 'ethers'
import { getStandardProvider } from './providers'
import Moralis from 'moralis/node'

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

  // const apiURL =
  //   'https://bsc.streamingfast.io/subgraphs/name/pancakeswap/exchange-v2'
  // // Get price for token with block number
  // try {
  //   const result = await ApiCache.graphqlRequest(apiURL, tokenPriceQuery, {
  //     block: Number(blockNumber),
  //     token: token.toLowerCase(),
  //   })

  //   if (result.token) {
  //     return result.token.derivedUSD
  //   }
  // } catch (e) {
  //   console.error('getPrice streamingfast error', e)
  // }
}

export let ignoredTokens: string[] = [
  '0x87230146E138d3F296a9a77e497A2A83012e9Bc5',
  '0x7a565284572d03ec50c35396f7d6001252eb43b6',
  '0x87230146e138d3f296a9a77e497a2a83012e9bc5',
]
export const getIgnoredTokens = (): string[] => ignoredTokens

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

    if (ignoredTokens.includes(token)) {
      return Promise.reject(
        `Token is unstable and is blacklisted. blockNumber: ${blockNumber}, token: ${token}, amount: ${amount}`
      )
    }
    // if (decimals != 18) {
    //   const totalSupply = await erc20Token.totalSupply()

    //   // Set the limit to this to ignore shitcoins
    //   // 100 000 000 000 000 000
    //   const maxSupply = new Decimal('100000000000000000')
    //   const currentSupply = new Decimal(
    //     ethers.utils.formatUnits(totalSupply, decimals)
    //   )
    //   if (currentSupply.gt(maxSupply)) {
    //     if (!ignoredTokens.includes(token)) {
    //       ignoredTokens.push(token)
    //     }

    //     return Promise.reject(
    //       `Token is unstable is blacklisted. Our limit of ${maxSupply.toString()} was exceeded with ${currentSupply.toString()}. blockNumber: ${blockNumber}, token: ${token}, amount: ${amount}`
    //     )
    //   }
    // }

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
