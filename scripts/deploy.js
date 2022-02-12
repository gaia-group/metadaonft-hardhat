async function main() {
  // This is just a convenience check
  if (network.name === 'hardhat') {
    console.warn(
      'You are trying to deploy a contract to the Hardhat Network, which' +
        'gets automatically created and destroyed every time. Use the Hardhat' +
        " option '--network localhost'"
    )
  }

  // FIXME: Need to populate this with the correct signer address
  const [deployer] = await ethers.getSigners()
  console.log('Deploying the contracts with the account:', await deployer.getAddress())

  console.log('Account balance:', (await deployer.getBalance()).toString())

  const MetaDaoNft = await ethers.getContractFactory('MetaDaoNft')
  const chancellor = ['0x32BF741D6DF2C00A0687b834FeC84D2A2B80388c', '0x25d53e88ae482e6612bed27d040b370c7e09838c']
  const archit3c = '0x25d53e88ae482e6612bed27d040b370c7e09838c'
  const founders = [archit3c, chancellor]
  const artist = '0x627137FC6cFa3fbfa0ed936fB4B5d66fB383DBE8'
  const baseURI = 'ipfs://QmQscUmBUYcbRsJmHueLAYBM5egSoS2iKkUbCKteFC68gd/'
  const token = await MetaDaoNft.deploy(founders, artist, baseURI)
  await token.deployed()

  console.log('Token address:', token.address)

  // We also save the contract's artifacts and address in the frontend directory
  saveFrontendFiles(token)
}

function saveFrontendFiles(token) {
  const fs = require('fs')
  // Frontend files are stored in a directory for the front end which is
  // adjacent to the harhat project directory.
  const contractsDir = __dirname + '/../../frontend/src/contracts'

  if (!fs.existsSync(contractsDir)) {
    fs.mkdirSync(contractsDir)
  }

  fs.writeFileSync(contractsDir + '/contract-address.json', JSON.stringify({ MetaDaoNft: token.address }, undefined, 2))

  const TokenArtifact = artifacts.readArtifactSync('MetaDaoNft')

  fs.writeFileSync(contractsDir + '/MetaDaoNft.json', JSON.stringify(TokenArtifact, null, 2))
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
