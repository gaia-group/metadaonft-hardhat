require('@nomiclabs/hardhat-waffle')
require('@nomiclabs/hardhat-etherscan')
const secrets = require('./secrets.json')

module.exports = {
  solidity: {
    version: '0.8.9',
    settings: {
      optimizer: {
        enabled: true,
        runs: 1,
      },
    },
  },
  networks: {
    ropsten: {
      url: `https://eth-ropsten.alchemyapi.io/v2/${secrets.ropsteinAlchemyKey}`,
      accounts: [`0x${secrets.testWalletPrivateKey}`],
    },
    rinkeby: {
      url: `https://eth-rinkeby.alchemyapi.io/v2/${secrets.rinkebyAlchemyKey}`,
      accounts: [`0x${secrets.testWalletPrivateKey}`],
    },
    mainnet: {
      url: `https://eth-mainnet.alchemyapi.io/v2/${secrets.mainnetAlchemyKey}`,
      accounts: [`0x${secrets.prodWalletPrivateKey}`],
    },
  },
  etherscan: {
    apiKey: secrets.etherscanApiKey,
  },
}
