const { expect } = require('chai')
const base64 = require('base-64')
const { getWhitelistParams, createWhitelistTree, rootFrom } = require('../frontend/src/utilities/merkleTrees')

// FIXME: Before live deployment, check these two functions are behaving as expected.
// and do one final audit on their tests.
//     withdrawAll -- access control + behavior
//     tokenURI -- rewrite specs specifically for this function once the art is ready and

describe('Token contract', function () {
  let Token
  let contract
  let owner
  let addr1
  let addr2
  let addr3
  let baseUri
  let maxMints
  let price
  let error

  async function isAddressWhitelisted(address, whitelistTree) {
    const { proof, positions } = getWhitelistParams(address, whitelistTree)
    return contract.verifyWhitelist(address, proof, positions)
  }

  beforeEach(async function () {
    Token = await ethers.getContractFactory('MetaDaoNft')
    ;[owner, addr1, addr2, addr3] = await ethers.getSigners()

    baseUri = 'https://example.com/'
    maxMints = 1000
    contract = await Token.deploy(baseUri, maxMints)
    price = await contract.PRICE()
    await contract.deployed()
    // Must unpause before most functions work.
    await contract.connect(owner).unpause()
    // Must have public mint opened before most functions work.
    // FIXME: Change this to separate out describe blocks for when paused vs. unpaused
    await contract.connect(owner).allowPublicMinting()
  })

  this.afterEach(() => {
    error = undefined
  })

  describe('name', function () {
    it('should return the correct name', async function () {
      expect(await contract.name()).to.equal('Meta DAO NFT')
    })
  })

  describe('symbol', function () {
    it('should return the correct symbol', async function () {
      expect(await contract.symbol()).to.equal('METADAONFT')
    })
  })

  describe('DEFAULT_ADMIN_ROLE', function () {
    it('should return the black hole address', async function () {
      expect(await contract.DEFAULT_ADMIN_ROLE()).to.equal(ethers.constants.HashZero)
    })
  })

  describe('PRICE', function () {
    it('should return the correct price', async function () {
      expect(price).to.equal(ethers.utils.parseEther('.2'))
    })
  })

  describe('MAX_MINT_HARDCAP', function () {
    it('should return the correct hardcap', async function () {
      expect(await contract.MAX_MINT_HARDCAP()).to.equal(10000)
    })
  })

  describe('Verifying whitelist', function () {
    let whitelistedAddresses, tree
    beforeEach(async function () {
      whitelistedAddresses = Array.from({ length: 100 }, () => ethers.Wallet.createRandom().address)
      tree = createWhitelistTree(whitelistedAddresses)
      await contract.connect(owner).updateWhitelist(rootFrom(tree))
    })

    it('should return true for all whitelisted addresses', async function () {
      const whitelistChecks = whitelistedAddresses.map((address) => isAddressWhitelisted(address, tree))
      expect(whitelistChecks.every(async (check) => (await check) === true)).to.equal(true)
    })

    it('should return false if address is not whitelisted', async function () {
      const unwhitelistedAddress = ethers.Wallet.createRandom().address
      const isWhitelisted = await isAddressWhitelisted(unwhitelistedAddress, tree)
      expect(isWhitelisted).to.equal(false)
    })
  })

  describe('Updating whitelist', function () {
    let whitelistedAddresses, tree
    beforeEach(async function () {
      whitelistedAddresses = Array.from({ length: 100 }, () => ethers.Wallet.createRandom().address)
      tree = createWhitelistTree(whitelistedAddresses)
    })

    it('fails if the minter does not have admin role', async function () {
      try {
        await contract.connect(addr1).updateWhitelist(rootFrom(tree))
        throw new Error('was not supposed to succeed')
      } catch (err) {
        error = err
      }
      expect(error.message).to.contain('Must be an admin')
    })

    it('should change the value from false to true of all whitelisted addresses', async function () {
      let whitelistChecks = whitelistedAddresses.map((address) => isAddressWhitelisted(address, tree))
      expect(whitelistChecks.every(async (check) => (await check) === false)).to.equal(true)

      await contract.connect(owner).updateWhitelist(rootFrom(tree))

      whitelistChecks = whitelistedAddresses.map((address) => isAddressWhitelisted(address, tree))
      expect(whitelistChecks.every(async (check) => (await check) === true)).to.equal(true)
    })

    it('should not make another random address whitelisted', async function () {
      await contract.connect(owner).updateWhitelist(rootFrom(tree))
      const unwhitelistedAddress = ethers.Wallet.createRandom().address
      expect(await isAddressWhitelisted(unwhitelistedAddress, tree)).to.equal(false)
    })
  })

  describe('Deploying', function () {
    beforeEach(async function () {
      contract = await Token.deploy(baseUri, 1337)
      await contract.deployed()
    })

    it('sets the sender as an admin', async function () {
      const defaultAdminRole = await contract.DEFAULT_ADMIN_ROLE()
      expect(await contract.getRoleMember(defaultAdminRole, 0)).to.equal(owner.address)
    })

    it('sets the sender as owner', async function () {
      expect(await contract.owner()).to.equal(owner.address)
    })

    it('pauses minting', async function () {
      expect(await contract.paused()).to.equal(true)
    })

    it('disallows public minting', async function () {
      expect(await contract.isPublicMintingAllowed()).to.equal(false)
    })

    it('sets the max mints to the provided value', async function () {
      expect(await contract.maxMints()).to.equal(1337)
    })

    it('fails if the max mints are greater than 10,000', async function () {
      try {
        contract = await Token.deploy(baseUri, 10001)
      } catch (err) {
        error = err
      }
      expect(error.message).to.contain('Cannot set max to be more than 10k.')
    })
  })

  describe('Pausing', function () {
    it('fails if the minter does not have admin role', async function () {
      try {
        await contract.connect(addr1).pause()
        throw new Error('was not supposed to succeed')
      } catch (err) {
        error = err
      }
      expect(error.message).to.contain('Must be an admin')
      expect(await contract.paused()).to.equal(false)
    })

    it('pauses if the minter has admin role', async function () {
      try {
        await contract.connect(owner).pause()
      } catch (err) {
        error = err
      }
      expect(error).to.be.undefined
      expect(await contract.paused()).to.equal(true)
    })

    it('disallows minting', async function () {
      await contract.mint(addr1.address, 1, [], [], { value: price })
      expect(await contract.balanceOf(addr1.address)).to.equal('1')

      await contract.connect(owner).pause()

      try {
        await contract.mint(addr1.address, 1, [], [], { value: price })
      } catch (err) {}
      expect(await contract.balanceOf(addr1.address)).to.equal('1')
    })

    it('returns a token URI of static Metadata', async function () {
      await contract.mint(addr1.address, 1, [], [], { value: price })
      expect(await contract.balanceOf(addr1.address)).to.equal('1')
      await contract.connect(owner).pause()
      const tokenURI = await contract.tokenURI(1)
      const [header, body] = tokenURI.split(',')
      const { name, description, image } = JSON.parse(base64.decode(body))

      expect(header).to.equal('data:application/json;base64')
      expect(name).to.equal('Meta DAO #1')
      expect(description).to.equal('The Meta DAO Pass represents your membership, granting access to Meta DAO perks.')
      expect(image).to.equal('https://ipfs.io/ipfs/Qmf1EruEbcdwfghq34RoWNgeh9edZSGKsAckk3nD6MrrvC')
    })
  })

  describe('Unpausing', function () {
    beforeEach(async function () {
      await contract.pause()
    })

    it('fails if the minter does not have admin role', async function () {
      try {
        await contract.connect(addr1).unpause()
        throw new Error('was not supposed to succeed')
      } catch (err) {
        error = err
      }
      expect(error.message).to.contain('Must be an admin')
      expect(await contract.paused()).to.equal(true)
    })

    it('does not error if the minter has admin role', async function () {
      try {
        await contract.connect(owner).unpause()
      } catch (err) {
        error = err
      }
      expect(error).to.be.undefined
      expect(await contract.paused()).to.equal(false)
    })

    it('allows minting again', async function () {
      try {
        await contract.mint(addr1.address, 1, [], [], { value: price })
      } catch (err) {}
      expect(await contract.balanceOf(addr1.address)).to.equal('0')
      await contract.connect(owner).unpause()
      await contract.mint(addr1.address, 1, [], [], { value: price })
      expect(await contract.balanceOf(addr1.address)).to.equal('1')
    })

    // FIXME: Write this
    it('returns a token URI with an IPFS link to live metadata based on baseURI', async function () {
      // This is the logic of the static metadata funtion, which needs to be updated.
      // await contract.mint(addr1.address, 1, [], [], { value: price })
      // expect(await contract.balanceOf(addr1.address)).to.equal('1')
      // await contract.connect(owner).pause()
      // const tokenURI = await contract.tokenURI(1)
      // const [header, body] = tokenURI.split(',')
      // const { name, description, image } = JSON.parse(base64.decode(body))
      // expect(header).to.equal('data:application/json;base64')
      // expect(name).to.equal('Meta #1')
      // expect(description).to.equal(
      //   'The Meta Pass represents your membership, granting access to Meta perks.'
      // )
      // expect(image).to.equal('https://ipfs.io/ipfs/Qmf1EruEbcdwfghq34RoWNgeh9edZSGKsAckk3nD6MrrvC')
    })
  })

  describe('Allowing public mint', function () {
    this.beforeEach(async () => {
      await contract.connect(owner).disallowPublicMinting()
    })

    it('fails if the caller does not have admin role', async function () {
      try {
        await contract.connect(addr1).allowPublicMinting()
        throw new Error('was not supposed to succeed')
      } catch (err) {
        error = err
      }
      expect(error.message).to.contain('Must be an admin')
      expect(await contract.isPublicMintingAllowed()).to.equal(false)
    })

    it('opens the public mint if the caller has admin role', async function () {
      try {
        await contract.connect(owner).allowPublicMinting()
      } catch (err) {
        error = err
      }
      expect(error).to.be.undefined
      expect(await contract.isPublicMintingAllowed()).to.equal(true)
    })

    it('allows public minting', async function () {
      await contract.connect(owner).allowPublicMinting()

      await contract.mint(addr1.address, 1, [], [], { value: price })
      expect(await contract.balanceOf(addr1.address)).to.equal('1')

      await contract.connect(owner).disallowPublicMinting()

      try {
        await contract.mint(addr1.address, 1, [], [], { value: price })
        throw new Error('was not supposed to succeed')
      } catch (err) {
        error = err
      }
      expect(error.message).to.contain('Not on whitelist.')
      expect(await contract.balanceOf(addr1.address)).to.equal('1')
    })
  })

  describe('Disallowing public mint', function () {
    it('fails if the minter does not have admin role', async function () {
      try {
        await contract.connect(addr1).disallowPublicMinting()
        throw new Error('was not supposed to succeed')
      } catch (err) {
        error = err
      }
      expect(error.message).to.contain('Must be an admin')
      expect(await contract.isPublicMintingAllowed()).to.equal(true)
    })

    it('closes the public mint if the minter has admin role', async function () {
      try {
        await contract.connect(owner).disallowPublicMinting()
      } catch (err) {
        error = err
      }
      expect(error).to.be.undefined
      expect(await contract.isPublicMintingAllowed()).to.equal(false)
    })

    it('does not allow public minting', async function () {
      await contract.connect(owner).disallowPublicMinting()

      try {
        await contract.mint(addr1.address, 1, [], [], { value: price })
      } catch (err) {
        error = err
      }
      expect(error.message).to.contain('Not on whitelist.')
      expect(await contract.balanceOf(addr1.address)).to.equal('0')

      // Add addr1 to whitelist
      const whitelistedAddresses = Array.from({ length: 100 }, () => ethers.Wallet.createRandom().address).concat(
        addr1.address
      )
      tree = createWhitelistTree(whitelistedAddresses)
      const { proof, positions } = getWhitelistParams(addr1.address, tree)
      await contract.connect(owner).updateWhitelist(rootFrom(tree))

      await contract.mint(addr1.address, 1, proof, positions, { value: price })
      expect(await contract.balanceOf(addr1.address)).to.equal('1')
    })
  })

  describe('Changing max mints', function () {
    it('fails if the minter does not have admin role', async function () {
      try {
        await contract.connect(addr1).setMaxMints(100)
      } catch (err) {
        error = err
      }
      expect(error.message).to.contain('Must be an admin')
    })

    it('changes the max mints if the minter has admin role and the value is under 10k', async function () {
      expect(await contract.maxMints()).to.equal('1000')
      await contract.connect(owner).setMaxMints(100)
      expect(await contract.maxMints()).to.equal('100')
    })

    it('changes the max mints if the minter has admin role and the value is 10k', async function () {
      expect(await contract.maxMints()).to.equal('1000')
      await contract.connect(owner).setMaxMints(10000)
      expect(await contract.maxMints()).to.equal('10000')
    })

    it('fails the max mints if the minter has admin role and the value is over 10k', async function () {
      try {
        await contract.connect(owner).setMaxMints(10001)
      } catch (err) {
        error = err
      }
      expect(error.message).to.contain('Cannot set max to be more than 10k.')
    })

    it('reopens minting', async function () {
      await contract.connect(owner).allowPublicMinting()
      await contract.connect(owner).setMaxMints(0)
      try {
        await contract.mint(addr1.address, 2, [], [], { value: price.mul(2) })
      } catch (err) {
        error = err
      }
      expect(error.message).to.contain('Soldout!')

      await contract.connect(owner).setMaxMints(2)
      await contract.mint(addr1.address, 2, [], [], { value: price.mul(2) })
      expect(await contract.balanceOf(addr1.address)).to.equal('2')

      try {
        await contract.mint(addr1.address, 1, [], [], { value: price })
      } catch (err) {
        error = err
      }
      expect(error.message).to.contain('Soldout!')
      expect(await contract.balanceOf(addr1.address)).to.equal('2')
    })
  })

  describe('Minting', function () {
    describe('when near the end', function () {
      it('correctly handles mint attempts at the end of mint', async function () {
        this.timeout(70000)
        for (i = 0; i < maxMints - 2; i += 2) {
          await contract.mint(addr1.address, 2, [], [], { value: price.mul(2) })
        }

        // Mint the penultimate mint
        await contract.mint(addr1.address, 1, [], [], { value: price })

        // Minting 2 when only one left
        try {
          await contract.mint(addr1.address, 2, [], [], { value: price.mul(2) })
          throw new Error('was not supposed to succeed')
        } catch (err) {
          error = err
        }
        expect(error.message).to.contain('Not enough mints left')

        // Mint the last one
        await contract.mint(addr1.address, 1, [], [], { value: price })

        // Minting 1 when none left
        try {
          await contract.mint(addr1.address, 1, [], [], { value: price })
          throw new Error('was not supposed to succeed')
        } catch (err) {
          error = err
        }
        expect(error.message).to.contain('Soldout!')

        // Minting 2 when none left
        try {
          await contract.mint(addr1.address, 2, [], [], { value: price.mul(2) })
          throw new Error('was not supposed to succeed')
        } catch (err) {
          error = err
        }
        expect(error.message).to.contain('Soldout!')
      })
    })

    describe('when minting amount not provided', function () {
      it('generates an error', async function () {
        try {
          await contract.mint(addr1.address)
          throw new Error('was not supposed to succeed')
        } catch (err) {
          error = err
        }
        expect(error.message).to.contain('missing argument')
      })
    })

    describe('when minting 0', function () {
      it('generates an error', async function () {
        try {
          await contract.mint(addr1.address, 0, [], [])
          throw new Error('was not supposed to succeed')
        } catch (err) {
          error = err
        }
        expect(error.message).to.contain('You must mint at least one.')
      })
    })

    describe('when minting 1 with the right amount of ETH', function () {
      beforeEach(async function () {
        await contract.mint(addr1.address, 1, [], [], { value: price })
      })

      it('creates 1 tokens and deposits it for the specified address', async function () {
        expect(await contract.balanceOf(addr1.address)).to.equal('1')
        expect(await contract.ownerOf('1')).to.equal(addr1.address)
      })

      it('mints the first token with the correct tokenURI', async function () {
        expect(await contract.tokenURI(1)).to.equal('https://example.com/1')
      })
    })

    describe('when minting 1 with too little ETH', function () {
      it('generates an error', async function () {
        try {
          await contract.mint(addr1.address, 1, [], [], { value: price.sub(1) })
          throw new Error('was not supposed to succeed')
        } catch (err) {
          error = err
        }
        expect(error.message).to.contain('Value below price')
      })
    })

    describe('when minting 1 with too much ETH', function () {
      it('mints only 1 token', async function () {
        await contract.mint(addr1.address, 1, [], [], { value: price.add(1000000) })
        expect(await contract.balanceOf(addr1.address)).to.equal('1')
      })

      it('deducts the full value of the tx + gas from sender', async function () {
        const paidAmount = price.add(1000000)
        const before = await addr1.getBalance()
        await contract.connect(addr1).mint(addr1.address, 1, [], [], { value: price.add(1000000) })
        const after = await addr1.getBalance()
        expect(before.sub(after)).to.be.above(paidAmount)
      })

      it('deposits the full amount into the owner address', async function () {
        const paidAmount = price.add(1000000)
        const contractAddress = await contract.address
        const before = await contract.provider.getBalance(contractAddress)
        await contract.connect(addr1).mint(addr1.address, 1, [], [], { value: paidAmount })
        const after = await contract.provider.getBalance(contractAddress)
        expect(after.sub(before)).to.equal(paidAmount)
      })
    })

    describe('when minting 2 with the right amount of ETH', function () {
      beforeEach(async function () {
        await contract.mint(addr1.address, 2, [], [], { value: price.mul(2) })
      })

      it('creates 2 tokens and deposits it for the specified address', async function () {
        expect(await contract.balanceOf(addr1.address)).to.equal('2')
      })

      it('mints the first token with the correct tokenURI', async function () {
        expect(await contract.tokenURI(1)).to.equal('https://example.com/1')
      })

      it('mints the second token with the correct tokenURI', async function () {
        expect(await contract.tokenURI(2)).to.equal('https://example.com/2')
      })
    })

    describe('when minting 2 with too little ETH', function () {
      it('generates an error', async function () {
        try {
          await contract.mint(addr1.address, 2, [], [], { value: price.sub(1) })
          throw new Error('was not supposed to succeed')
        } catch (err) {
          error = err
        }
        expect(error.message).to.contain('Value below price')
      })
    })

    describe('when minting 2 with too much ETH', function () {
      it('mints only 2 tokens', async function () {
        await contract.mint(addr1.address, 2, [], [], { value: price.mul(2).add(1000000) })
        expect(await contract.balanceOf(addr1.address)).to.equal('2')
      })

      it('deducts the full value of the tx + gas from sender', async function () {
        const paidAmount = price.mul(2).add(1000000)
        const before = await addr1.getBalance()
        await contract.connect(addr1).mint(addr1.address, 1, [], [], { value: paidAmount })
        const after = await addr1.getBalance()
        expect(before.sub(after)).to.be.above(paidAmount)
      })

      it('deposits the full amount into the owner address', async function () {
        const paidAmount = price.mul(2).add(1000000)
        const contractAddress = await contract.address
        const before = await contract.provider.getBalance(contractAddress)
        await contract.connect(addr1).mint(addr1.address, 1, [], [], { value: paidAmount })
        const after = await contract.provider.getBalance(contractAddress)
        expect(after.sub(before)).to.equal(paidAmount)
      })
    })

    describe('when minting 3', function () {
      it('generates an error', async function () {
        try {
          await contract.mint(addr1.address, 3, [], [])
          throw new Error('was not supposed to succeed')
        } catch (err) {
          error = err
        }
        expect(error.message).to.contain("You can't mint more than 2 at once.")
      })
    })

    describe('when minting is paused', function () {
      beforeEach(async function () {
        await contract.pause()
      })

      it('does not mint any tokens', async function () {
        try {
          await contract.mint(addr1.address, 2, [], [], { value: price.mul(2).add(1000000) })
        } catch (err) {}
        expect(await contract.balanceOf(addr1.address)).to.equal('0')
      })

      it('does not transfer the value of the tx from sender', async function () {
        const before = ethers.utils.formatEther(await addr1.getBalance())
        try {
          await contract.connect(addr1).mint(addr1.address, 1, { value: price.mul(2).add(1000000) })
        } catch (err) {}
        const after = ethers.utils.formatEther(await addr1.getBalance())
        expect(before - after).to.be.below(0.41)
      })

      it('does not deposite the ETH into the owner address', async function () {
        const contractAddress = await contract.address
        const before = ethers.utils.formatEther(await contract.provider.getBalance(contractAddress))

        try {
          await contract.connect(addr1).mint(addr1.address, 1, { value: price.mul(2).add(1000000) })
        } catch (err) {}
        const after = ethers.utils.formatEther(await contract.provider.getBalance(contractAddress))
        expect(after - before).to.equal(0)
      })

      it('generates an error', async function () {
        try {
          await contract.mint(addr1.address, 2, [], [], { value: price.mul(2).add(1000000) })
          throw new Error('was not supposed to succeed')
        } catch (err) {
          error = err
        }
        expect(error.message).to.contain('Sales not open.')
      })
    })

    describe('when minting is open to the public', function () {
      it('non-whitelisted addresses are able to mint', async function () {
        await contract.mint(addr1.address, 1, [], [], { value: price })
        expect(await contract.balanceOf(addr1.address)).to.equal('1')
      })

      it('whitelisted addresses are able to mint', async function () {
        // Add addr1 to whitelist
        const whitelistedAddresses = Array.from({ length: 100 }, () => ethers.Wallet.createRandom().address).concat(
          addr1.address
        )
        tree = createWhitelistTree(whitelistedAddresses)
        const { proof, positions } = getWhitelistParams(addr1.address, tree)
        await contract.connect(owner).updateWhitelist(rootFrom(tree))

        await contract.mint(addr1.address, 1, proof, positions, { value: price })

        expect(await contract.balanceOf(addr1.address)).to.equal('1')
      })
    })

    describe('when minting is only open to the whitelist', function () {
      beforeEach(async function () {
        await contract.connect(owner).disallowPublicMinting()
      })

      it('non-whitelisted addresses are unable to mint', async function () {
        try {
          await contract.mint(addr1.address, 1, [], [], { value: price })
          throw new Error('was not supposed to succeed')
        } catch (err) {
          error = err
        }
        expect(error.message).to.contain('Not on whitelist.')
      })

      it('whitelisted addresses are able to mint', async function () {
        // Add addr1 to whitelist
        const whitelistedAddresses = Array.from({ length: 100 }, () => ethers.Wallet.createRandom().address).concat(
          addr1.address
        )
        tree = createWhitelistTree(whitelistedAddresses)
        const { proof, positions } = getWhitelistParams(addr1.address, tree)
        await contract.connect(owner).updateWhitelist(rootFrom(tree))

        await contract.mint(addr1.address, 1, proof, positions, { value: price })

        expect(await contract.balanceOf(addr1.address)).to.equal('1')
      })
    })
  })

  describe('Withdrawing', function () {
    let expectedBalance

    beforeEach(async function () {
      const numMints = 20
      expectedBalance = 0.2 * numMints

      // Mint a few to generate some ETH
      for (i = 0; i < numMints; i++) {
        await contract.connect(addr3).mint(addr3.address, 1, [], [], { value: price })
      }
    })

    // FIXME: Write this spec.
    describe('with no balance in the contract', function () {})

    describe('with only the owner as a DEFAULT_ADMIN', function () {
      // FIXME: Should only send 25% of ETH to the owner, the rest to the community wallet.
      it('sends all ETH to the owner', async function () {
        const before = ethers.utils.formatEther(await owner.getBalance())
        await contract.withdrawAll()
        const after = ethers.utils.formatEther(await owner.getBalance())
        const balanceMinusGas = expectedBalance - 0.0001
        expect(after - before).to.be.within(balanceMinusGas, expectedBalance)
      })
    })

    describe('with three people on DEFAULT_ADMIN', function () {
      // FIXME: Should only send 25% of ETH to the owners, split in 3. The rest to the community wallet.
      it('sends an equal share to all people with DEFAULT_ADMIN role', async function () {
        const DEFAULT_ADMIN_ROLE = await contract.DEFAULT_ADMIN_ROLE()
        balanceMinusGas = expectedBalance / 3 - 0.0001

        await contract.connect(owner).grantRole(DEFAULT_ADMIN_ROLE, addr1.address)

        await contract.connect(owner).hasRole(DEFAULT_ADMIN_ROLE, addr1.address)

        await contract.connect(owner).grantRole(DEFAULT_ADMIN_ROLE, addr1.address)

        await contract.connect(owner).grantRole(DEFAULT_ADMIN_ROLE, addr2.address)

        const ownerBefore = ethers.utils.formatEther(await owner.getBalance())
        const addr1Before = ethers.utils.formatEther(await addr1.getBalance())
        const addr2Before = ethers.utils.formatEther(await addr2.getBalance())

        await contract.withdrawAll()

        const ownerAfter = ethers.utils.formatEther(await owner.getBalance())
        const addr1After = ethers.utils.formatEther(await addr1.getBalance())
        const addr2After = ethers.utils.formatEther(await addr2.getBalance())

        expect(ownerAfter - ownerBefore).to.be.within(balanceMinusGas, expectedBalance)
        expect(addr1After - addr1Before).to.be.within(balanceMinusGas, expectedBalance)
        expect(addr2After - addr2Before).to.be.within(balanceMinusGas, expectedBalance)
      })
    })
  })
})
