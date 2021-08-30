import { NODE, NETWORK_ID } from './config';
import secrets from 'secrets';
export default {
  api: {
    ipfs: 'https://ipfs.blockfrost.dev/ipfs',
    base: (node = NODE.blockfrost.mainnet) => node,
    key: (provider, network = 'mainnet') => ({
      [secrets[provider].AUTH_HEADER]:
        network === NETWORK_ID.mainnet
          ? secrets[provider].PROJECT_ID_MAINNET
          : secrets[provider].PROJECT_ID_TESTNET,
    }),
    price: (currency = 'usd') =>
      fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=cardano&vs_currencies=${currency}`
      )
        .then((res) => res.json())
        .then((res) => res.cardano[currency]),
  },
};
