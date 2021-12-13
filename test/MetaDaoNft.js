const { expect } = require('chai')
const base64 = require('base-64')
const { getWhitelistParams, createWhitelistTree, rootFrom } = require('../../frontend/src/utilities/merkleTrees')

// FIXME: Before live deployment, check these two functions are behaving as expected.
// and do one final audit on their tests.
//     withdrawAll -- access control + behavior

describe('Token contract', function () {
  let Token
  let contract
  let owner
  let addr1
  let addr2
  let addr3
  let maxMints
  let price
  let error
  let communityWalletAddress

  async function isAddressWhitelisted(address, whitelistTree) {
    const { proof, positions } = getWhitelistParams(address, whitelistTree)
    return contract.verifyWhitelist(address, proof, positions)
  }

  beforeEach(async function () {
    Token = await ethers.getContractFactory('MetaDaoNft')
    ;[owner, addr1, addr2, addr3] = await ethers.getSigners()

    maxMints = 1000
    contract = await Token.deploy(maxMints)
    price = await contract.PRICE()
    communityWalletAddress = await contract.COMMUNITY_WALLET_ADDRESS()
    await contract.deployed()
    // Must have public mint opened before most functions work.
    // FIXME: Change this to separate out describe blocks for when public minting enabled vs. disabled
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
      expect(price).to.equal(ethers.utils.parseEther('.08'))
    })
  })

  describe('COMMUNITY_WALLET_ADDRESS', function () {
    it('should return the correct address', async function () {
      expect(communityWalletAddress).to.equal('0x3a919e034318ac01aE8C313fabDB78c2E658CCb2')
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
      contract = await Token.deploy(1337)
      await contract.deployed()
    })

    it('sets the sender as an admin', async function () {
      const defaultAdminRole = await contract.DEFAULT_ADMIN_ROLE()
      expect(await contract.getRoleMember(defaultAdminRole, 0)).to.equal(owner.address)
    })

    it('sets the sender as owner', async function () {
      expect(await contract.owner()).to.equal(owner.address)
    })

    it('disallows public minting', async function () {
      expect(await contract.isPublicMintingAllowed()).to.equal(false)
    })

    it('sets the max mints to the provided value', async function () {
      expect(await contract.maxMints()).to.equal(1337)
    })

    it('fails if the max mints are greater than 10,000', async function () {
      try {
        contract = await Token.deploy(10001)
      } catch (err) {
        error = err
      }
      expect(error.message).to.contain('Cannot set max to be more than 10k.')
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

      await contract.mint(addr1.address, [], [], { value: price })
      expect(await contract.balanceOf(addr1.address)).to.equal('1')

      await contract.connect(owner).disallowPublicMinting()

      try {
        await contract.mint(addr1.address, [], [], { value: price })
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
        await contract.mint(addr1.address, [], [], { value: price })
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

      await contract.mint(addr1.address, proof, positions, { value: price })
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

    it('closes minting if set below supply, and reopens when set above it', async function () {
      await contract.connect(owner).allowPublicMinting()
      await contract.connect(owner).setMaxMints(0)
      try {
        await contract.mint(addr1.address, [], [], { value: price })
      } catch (err) {
        error = err
      }
      expect(error.message).to.contain('Soldout!')

      await contract.connect(owner).setMaxMints(1)
      await contract.mint(addr1.address, [], [], { value: price })
      expect(await contract.balanceOf(addr1.address)).to.equal('1')

      try {
        await contract.mint(addr1.address, [], [], { value: price })
      } catch (err) {
        error = err
      }
      expect(error.message).to.contain('Soldout!')
      expect(await contract.balanceOf(addr1.address)).to.equal('1')
    })
  })

  describe('Minting', function () {
    describe('when the address has already minted', function () {
      beforeEach(async function () {
        await contract.connect(addr1).mint(addr1.address, [], [], { value: price })
      })

      it('generates an error', async function () {
        try {
          await contract.mint(addr1.address, [], [], { value: price })
          throw new Error('was not supposed to succeed')
        } catch (err) {
          error = err
        }
        expect(error.message).to.contain('Already minted')
      })
    })

    describe('when the address has received a mint from elsehwere', function () {
      beforeEach(async function () {
        await contract.connect(addr2).mint(addr2.address, [], [], { value: price })
        await contract.connect(addr2)['safeTransferFrom(address,address,uint256)'](addr2.address, addr1.address, 1)
      })

      it('generates an error', async function () {
        try {
          await contract.mint(addr1.address, [], [], { value: price })
          throw new Error('was not supposed to succeed')
        } catch (err) {
          error = err
        }
        expect(error.message).to.contain('Already minted')
      })
    })

    describe('when supply is near maxMints', function () {
      it('correctly handles mint attempts at the end of mint', async function () {
        await contract.setMaxMints(1)

        // Mint the last one
        await contract.mint(addr1.address, [], [], { value: price })
        expect(await contract.balanceOf(addr1.address)).to.equal('1')

        // Minting when none left
        try {
          await contract.mint(addr1.address, [], [], { value: price })
          throw new Error('was not supposed to succeed')
        } catch (err) {
          error = err
        }
        expect(error.message).to.contain('Soldout!')
      })
    })

    describe('when all required params not provided', function () {
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

    describe('when minting with the right amount of ETH', function () {
      beforeEach(async function () {
        await contract.mint(addr1.address, [], [], { value: price })
      })

      it('creates 1 tokens and deposits it for the specified address', async function () {
        expect(await contract.balanceOf(addr1.address)).to.equal('1')
        expect(await contract.ownerOf('1')).to.equal(addr1.address)
      })

      it('mints the token with the correct tokenURI', async function () {
        const tokenURI = await contract.tokenURI(1)
        const [header, body] = tokenURI.split(',')
        const { name, description, image } = JSON.parse(base64.decode(body))

        expect(header).to.equal('data:application/json;base64')
        expect(name).to.equal('Meta DAO #1')
        expect(description).to.equal('The Meta DAO Pass represents your membership, granting access to Meta DAO perks.')
        expect(image).to.equal('https://ipfs.io/ipfs/Qmf1EruEbcdwfghq34RoWNgeh9edZSGKsAckk3nD6MrrvC')
      })
    })

    describe('when minting with too little ETH', function () {
      it('generates an error', async function () {
        try {
          await contract.mint(addr1.address, [], [], { value: price.sub(1) })
          throw new Error('was not supposed to succeed')
        } catch (err) {
          error = err
        }
        expect(error.message).to.contain('Value below price')
      })
    })

    describe('when minting with too much ETH', function () {
      it('mints 1 token', async function () {
        await contract.mint(addr1.address, [], [], { value: price.add(1000000) })
        expect(await contract.balanceOf(addr1.address)).to.equal('1')
      })

      it('deducts the full value of the tx + gas from sender', async function () {
        const paidAmount = price.add(1000000)
        const before = await addr1.getBalance()
        await contract.connect(addr1).mint(addr1.address, [], [], { value: price.add(1000000) })
        const after = await addr1.getBalance()
        expect(before.sub(after)).to.be.above(paidAmount)
      })

      it('deposits the full amount into the contract address', async function () {
        const paidAmount = price.add(1000000)
        const contractAddress = await contract.address
        const before = await contract.provider.getBalance(contractAddress)
        await contract.connect(addr1).mint(addr1.address, [], [], { value: paidAmount })
        const after = await contract.provider.getBalance(contractAddress)
        expect(after.sub(before)).to.equal(paidAmount)
      })
    })

    describe('when minting is open to the public', function () {
      it('non-whitelisted addresses are able to mint', async function () {
        await contract.mint(addr1.address, [], [], { value: price })
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

        await contract.mint(addr1.address, proof, positions, { value: price })

        expect(await contract.balanceOf(addr1.address)).to.equal('1')
      })
    })

    describe('when minting is only open to the whitelist', function () {
      beforeEach(async function () {
        await contract.connect(owner).disallowPublicMinting()
      })

      it('non-whitelisted addresses are unable to mint', async function () {
        try {
          await contract.mint(addr1.address, [], [], { value: price })
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

        await contract.mint(addr1.address, proof, positions, { value: price })

        expect(await contract.balanceOf(addr1.address)).to.equal('1')
      })
    })
  })

  describe('Withdrawing', function () {
    let expectedBalance

    beforeEach(async function () {
      const signers = await ethers.getSigners()
      const numMints = ethers.BigNumber.from(signers.length)
      expectedBalance = price.mul(numMints)

      // Mint a few to generate some ETH
      for (i = 0; i < numMints; i++) {
        await contract.connect(signers[i]).mint(signers[i].address, [], [], { value: price })
      }
    })

    describe('when not an admin', function () {
      it('generates an error', async function () {
        try {
          await contract.connect(addr3).withdrawAll()
          throw new Error('was not supposed to succeed')
        } catch (err) {
          error = err
        }
        expect(error.message).to.contain('Must be an admin.')
      })
    })

    describe('with no balance in the contract', function () {
      beforeEach(async function () {
        // Withdraw all funds
        await contract.connect(owner).withdrawAll()
      })

      it('generates an error', async function () {
        try {
          await contract.connect(owner).withdrawAll()
          throw new Error('was not supposed to succeed')
        } catch (err) {
          error = err
        }
        expect(error.message).to.contain('Nothing to withdraw.')
      })
    })

    // FIXME: There should probably be a different role just for withdrawing,
    // And there should never be less than one person who can withdraw.
    describe.skip('with no DEFAULT_ADMINs on contract', function () {
      beforeEach(async function () {
        await contract.connect(owner).revokeRole(await contract.DEFAULT_ADMIN_ROLE(), owner.address)
      })

      it('sends 100% to the community wallet', async function () {
        const communityWallet = contract.provider.getSigner('0x3a919e034318ac01aE8C313fabDB78c2E658CCb2')

        const before = ethers.utils.formatEther(await communityWallet.getBalance())
        await contract.withdrawAll()
        const after = ethers.utils.formatEther(await communityWallet.getBalance())
        const balanceMinusGas = expectedBalance - 0.0001
        expect(after - before).to.be.within(balanceMinusGas, expectedBalance)
      })
    })

    describe('with only the owner as a DEFAULT_ADMIN', function () {
      it('sends 75% to the community wallet', async function () {
        expectedBalance = expectedBalance.mul(75).div(100)
        const communityWallet = contract.provider.getSigner('0x3a919e034318ac01aE8C313fabDB78c2E658CCb2')

        const before = await communityWallet.getBalance()
        await contract.withdrawAll()
        const after = await communityWallet.getBalance()
        expect(after.sub(before)).to.equal(expectedBalance)
      })

      it('sends the remainings 25% to the owner (accounting for gas)', async function () {
        expectedBalance = expectedBalance.mul(25).div(100)
        const before = await owner.getBalance()
        const tx = await contract.withdrawAll()
        const receipt = await tx.wait()

        const after = await owner.getBalance()
        const gasPaid = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice)
        expect(after.sub(before)).to.equal(expectedBalance.sub(gasPaid))
      })
    })

    describe('with three people on DEFAULT_ADMIN', function () {
      it('sends 75% to the community wallet', async function () {
        expectedBalance = expectedBalance.mul(75).div(100)
        const communityWallet = contract.provider.getSigner('0x3a919e034318ac01aE8C313fabDB78c2E658CCb2')

        const before = await communityWallet.getBalance()
        await contract.withdrawAll()
        const after = await communityWallet.getBalance()
        expect(after.sub(before)).to.equal(expectedBalance)
      })

      it('sends an equal share of the remaining 25% to all people with DEFAULT_ADMIN role', async function () {
        const DEFAULT_ADMIN_ROLE = await contract.DEFAULT_ADMIN_ROLE()
        expectedBalance = expectedBalance.mul(25).div(100).div(3)

        await contract.connect(owner).grantRole(DEFAULT_ADMIN_ROLE, addr1.address)
        await contract.connect(owner).grantRole(DEFAULT_ADMIN_ROLE, addr2.address)

        const ownerBefore = await owner.getBalance()
        const addr1Before = await addr1.getBalance()
        const addr2Before = await addr2.getBalance()

        const tx = await contract.withdrawAll()
        const receipt = await tx.wait()
        const gasPaid = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice)

        const ownerAfter = await owner.getBalance()
        const addr1After = await addr1.getBalance()
        const addr2After = await addr2.getBalance()

        expect(ownerAfter.sub(ownerBefore)).to.equal(expectedBalance.sub(gasPaid))
        expect(addr1After.sub(addr1Before)).to.equal(expectedBalance)
        expect(addr2After.sub(addr2Before)).to.equal(expectedBalance)
      })
    })
  })
})
