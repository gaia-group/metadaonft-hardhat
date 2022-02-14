async function main() {
  // This is just a convenience check
  if (network.name === 'hardhat') {
    console.warn(
      'You are trying to deploy a contract to the Hardhat Network, which' +
        'gets automatically created and destroyed every time. Use the Hardhat' +
        " option '--network localhost'"
    )
  }

  const [deployer] = await ethers.getSigners()
  console.log('Deploying the contracts with the account:', await deployer.getAddress())

  console.log('Account balance:', (await deployer.getBalance()).toString())

  const MetaDaoNft = await ethers.getContractFactory('MetaDaoNft')
  const chancellor = '0x32BF741D6DF2C00A0687b834FeC84D2A2B80388c'
  const archit3c = '0x25d53e88ae482e6612bEd27d040B370c7e09838c'
  const founders = [archit3c, chancellor]
  const artist = '0x627137FC6cFa3fbfa0ed936fB4B5d66fB383DBE8'
  const staff = {
    ThePokeMongi: '0x367c9122748a56e3174df6a2c6bcc9d634fd2bea',
    '0xYxussef7!': '0xFBA6cCdf60c712Bf96c094D989DDf412d1559A62',
    'F-14 Tomcat': '0xc383039f20d6f438c60782cb7a04ec18dab5b66e',
    nero: '0x84B8Da634d034Ff8067503CEA37828c77A9CBEab',
    Ocean: '0x914efE0Cb888791163ABa4a5c9CE03DA349E34d7',
    domruby: '0x0ec88a8b2973B21E38F8c46A6CafAdE2514DF73c',
    PRD: '0x614672b1df0DA50D65472222C610980f86BE3965',
  }
  const baseURI = 'ipfs://QmXmbww58WW86N6yd7gq7x55Y5dG64nnEG88ZwpMjd7wzK/'
  const token = await MetaDaoNft.deploy(founders, artist, Object.values(staff), baseURI)
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
