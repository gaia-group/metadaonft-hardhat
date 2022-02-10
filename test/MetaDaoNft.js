const { expect } = require('chai')
const base64 = require('base-64')
const keccak256 = require('keccak256')
const { getWhitelistParams, createWhitelistTree, rootFrom } = require('../../frontend/src/utilities/merkleTrees')

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
  let proof
  let baseURI

  async function massMint(amount) {
    let batchSize = 200
    let numMinted = 0
    let numBatches

    // Load up the owner with more ETH
    const signers = await ethers.getSigners()
    await signers[signers.length - 1].sendTransaction({ to: owner.address, value: ethers.utils.parseEther('100') })
    await signers[signers.length - 2].sendTransaction({ to: owner.address, value: ethers.utils.parseEther('100') })
    await signers[signers.length - 3].sendTransaction({ to: owner.address, value: ethers.utils.parseEther('100') })
    await signers[signers.length - 4].sendTransaction({ to: owner.address, value: ethers.utils.parseEther('100') })

    while (batchSize > 0) {
      numBatches = Math.floor((amount - numMinted) / batchSize)

      for (let i = 0; i < numBatches; i++) {
        try {
          await contract.connect(owner).mint(owner.address, batchSize, [], [], { value: 0 })
        } catch (error) {}
        numMinted += batchSize
      }

      batchSize = Math.floor(batchSize / 2)
      numBatches = Math.floor((amount - numMinted) / batchSize)
    }
  }

  async function isAddressWhitelisted(address, whitelistTree) {
    const { proof, positions } = getWhitelistParams(address, whitelistTree)
    return contract.verifyWhitelist(address, proof, positions)
  }

  beforeEach(async function () {
    Token = await ethers.getContractFactory('MetaDaoNft')
    ;[owner, addr1, addr2, addr3, artist] = await ethers.getSigners()
    baseURI = 'ipfs://example/'

    contract = await Token.deploy([], artist.address, baseURI)
    price = await contract.PRICE()
    maxMints = await contract.MAX_MINTS()
    await contract.deployed()
  })

  afterEach(() => {
    error = undefined
  })

  describe('constants', function () {
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
        expect(price).to.equal(ethers.utils.parseEther('.04'))
      })
    })

    describe('FOUNDER_ROLE', function () {
      it('should return the correct value', async function () {
        expect(await contract.FOUNDER_ROLE()).to.equal(`0x${keccak256('FOUNDER_ROLE').toString('hex')}`)
      })
    })

    describe('MAX_MINTS', function () {
      it('should return the correct max number of mints', async function () {
        expect(maxMints).to.equal(4444)
      })
    })

    describe('owner', function () {
      it('should return the correct owner', async function () {
        expect(await contract.owner()).to.equal(owner.address)
      })
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
    let founders

    beforeEach(async function () {
      founders = Array.from({ length: 3 }, () => ethers.Wallet.createRandom().address)
      contract = await Token.deploy(founders, artist.address, baseURI)
      await contract.deployed()
    })

    it('sets the provided addresses as founders', async function () {
      const founderRole = await contract.FOUNDER_ROLE()
      founders.forEach(async (address) => {
        expect(await contract.hasRole(founderRole, address)).to.equal(true)
      })
    })

    it('sets the provided addresses as artist', async function () {
      const artistRole = await contract.ARTIST_ROLE()
      expect(await contract.hasRole(artistRole, artist.address)).to.equal(true)
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
  })

  describe('Withdrawing', function () {
    let expectedBalance

    beforeEach(async function () {
      // Mint a few to generate some ETH - easier to do when contract is in public mint state
      await contract.connect(owner).allowPublicMinting()
      const signers = await ethers.getSigners()
      const numMints = ethers.BigNumber.from(signers.length)
      expectedBalance = price.mul(numMints)

      for (i = 0; i < numMints; i++) {
        await contract.connect(signers[i]).mint(signers[i].address, 1, [], [], { value: price })
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

    describe('with no FOUNDER_ROLE holders on contract', function () {
      it('sends 100% to the artist', async function () {
        const before = await artist.getBalance()
        await contract.withdrawAll()
        const after = await artist.getBalance()
        expect(after.sub(before)).to.equal(expectedBalance)
      })
    })

    describe('with only one person as a FOUNDER_ROLE', function () {
      beforeEach(async function () {
        await contract.connect(owner).grantRole(await contract.FOUNDER_ROLE(), owner.address)
      })

      it('sends the remainings 90% to the FOUNDER (accounting for gas)', async function () {
        expectedBalance = expectedBalance.mul(90).div(100)
        const before = await owner.getBalance()
        const tx = await contract.withdrawAll()
        const receipt = await tx.wait()

        const after = await owner.getBalance()
        const gasPaid = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice)
        expect(after.sub(before)).to.equal(expectedBalance.sub(gasPaid))
      })

      it('sends 10% to the ARTIST', async function () {
        expectedBalance = expectedBalance.mul(10).div(100)
        const before = await artist.getBalance()
        await contract.withdrawAll()

        const after = await artist.getBalance()
        expect(after.sub(before)).to.equal(expectedBalance)
      })
    })

    describe('with two people on FOUNDER_ROLE', function () {
      beforeEach(async function () {
        const FOUNDER_ROLE = await contract.FOUNDER_ROLE()
        await contract.connect(owner).grantRole(FOUNDER_ROLE, addr1.address)
        await contract.connect(owner).grantRole(FOUNDER_ROLE, addr2.address)
      })

      it('sends 10% to the ARTIST', async function () {
        expectedBalance = expectedBalance.mul(10).div(100)
        const before = await artist.getBalance()
        await contract.withdrawAll()

        const after = await artist.getBalance()
        expect(after.sub(before)).to.equal(expectedBalance)
      })

      it('sends an equal share of the remaining 90% to the two FOUNDER_ROLE holders', async function () {
        expectedBalance = expectedBalance.mul(90).div(100).div(2)

        const addr1Before = await addr1.getBalance()
        const addr2Before = await addr2.getBalance()

        await contract.withdrawAll()

        const addr1After = await addr1.getBalance()
        const addr2After = await addr2.getBalance()

        expect(addr1After.sub(addr1Before)).to.equal(expectedBalance)
        expect(addr2After.sub(addr2Before)).to.equal(expectedBalance)
      })
    })
  })

  describe('Minting', function () {
    let numMints, value

    describe('when no recipient provided', function () {
      it('generates an error', async function () {
        try {
          await contract.connect(addr1).mint(null, 5, [], [])
          throw new Error('was not supposed to succeed')
        } catch (err) {
          error = err
        }
        expect(error.message).to.contain('invalid address')
      })
    })

    describe('when no numMints provided', function () {
      it('generates an error', async function () {
        try {
          await contract.connect(addr1).mint(addr1.address, null, [], [])
          throw new Error('was not supposed to succeed')
        } catch (err) {
          error = err
        }
        expect(error.message).to.contain('invalid BigNumber value')
      })
    })

    describe('when no proof provided', function () {
      it('generates an error', async function () {
        try {
          await contract.connect(addr1).mint(addr1.address, 1, null, [])
          throw new Error('was not supposed to succeed')
        } catch (err) {
          error = err
        }
        expect(error.message).to.contain('invalid value for array')
      })
    })

    describe('when no positions provided', function () {
      it('generates an error', async function () {
        try {
          await contract.connect(addr1).mint(addr1.address, 1, [], null)
          throw new Error('was not supposed to succeed')
        } catch (err) {
          error = err
        }
        expect(error.message).to.contain('invalid value for array')
      })
    })

    describe('when numMints is 0', function () {
      it('generates an error', async function () {
        try {
          await contract.connect(addr1).mint(addr1.address, 0, [], [])
          throw new Error('was not supposed to succeed')
        } catch (err) {
          error = err
        }
        expect(error.message).to.contain('Must provide an amount to mint.')
      })
    })

    describe('when numMints is negative', function () {
      it('generates an error', async function () {
        try {
          await contract.connect(addr1).mint(addr1.address, -1, [], [])
          throw new Error('was not supposed to succeed')
        } catch (err) {
          error = err
        }
        expect(error.message).to.contain('value out-of-bounds')
      })
    })

    function itShouldSuccessfullyMint(numMints) {
      describe(`when the number of mints is ${numMints}`, function () {
        describe('with the correct amount of ETH', function () {
          beforeEach(function () {
            value = price.mul(numMints)
          })

          it('mints one to the intended recipient and captures payment', async function () {
            await contract.connect(addr2).mint(addr1.address, numMints, proof, positions, { value })
            const contractBalance = await ethers.provider.getBalance(contract.address)
            expect(await contract.balanceOf(addr1.address)).to.equal(numMints.toString())
            expect(contractBalance).to.equal(value.toString())
          })
        })

        describe('with too much ETH', function () {
          beforeEach(function () {
            value = price.mul(numMints).add(price)
          })

          it('mints one to the intended recipient and captures full payment (keeps the change)', async function () {
            await contract.connect(addr2).mint(addr1.address, numMints, proof, positions, { value })
            const contractBalance = await ethers.provider.getBalance(contract.address)
            expect(await contract.balanceOf(addr1.address)).to.equal(numMints.toString())
            expect(contractBalance).to.equal(value.toString())
          })
        })

        describe('with too little ETH', function () {
          beforeEach(function () {
            value = price.mul(numMints).sub(1)
          })

          it('does not mint to the recipient and generates an error', async function () {
            try {
              await contract.connect(addr2).mint(addr1.address, numMints, proof, positions, { value })
              throw new Error('was not supposed to succeed')
            } catch (err) {
              error = err
            }
            expect(await contract.balanceOf(addr1.address)).to.equal('0')
            expect(error.message).to.contain('Value below price')
          })
        })
      })
    }

    function itShouldNotSuccessfullyMint(numMints) {
      describe(`when the number of mints is ${numMints}`, function () {
        beforeEach(function () {
          value = price.mul(numMints)
        })

        it('does not mint to the recipient and generates an error', async function () {
          try {
            await contract.connect(addr2).mint(addr1.address, numMints, proof, positions, { value })
            throw new Error('was not supposed to succeed')
          } catch (err) {
            error = err
          }
          expect(await contract.balanceOf(addr1.address)).to.equal('0')
          expect(error.message).to.contain('Not on whitelist')
        })
      })
    }

    describe('when owner is minting', function () {
      it('allows minting any amount for free', async function () {
        await contract.connect(owner).mint(addr1.address, 12, [], [], { value: 0 })
        expect(await contract.balanceOf(addr1.address)).to.equal('12')
      })
    })

    describe('during whitelist sale', function () {
      describe('when sender is on whitelist', function () {
        beforeEach(async function () {
          // Need at least 2 addresses on whitelist. Cannot make a tree with only one.
          const whitelistedAddresses = [ethers.Wallet.createRandom().address, addr2.address]

          tree = createWhitelistTree(whitelistedAddresses)
          ;({ proof, positions } = getWhitelistParams(addr2.address, tree))
          await contract.connect(owner).updateWhitelist(rootFrom(tree))
        })

        for (let numMints = 1; numMints <= 2; numMints++) itShouldSuccessfullyMint(numMints)

        describe('when the number of mints is 3', function () {
          beforeEach(function () {
            numMints = 3
            value = price.mul(numMints)
          })

          it('does not mint to the recipient', async function () {
            try {
              await contract.connect(addr2).mint(addr1.address, numMints, proof, positions, { value })
            } catch (err) {}
            expect(await contract.balanceOf(addr1.address)).to.equal('0')
          })

          it('generates an error', async function () {
            try {
              await contract.connect(addr2).mint(addr1.address, numMints, proof, positions, { value })
              throw new Error('was not supposed to succeed')
            } catch (err) {
              error = err
            }
            expect(error.message).to.contain('Can mint a max of 2 during presale')
          })
        })
      })

      describe('when sender is not on whitelist', function () {
        beforeEach(function () {
          proof = positions = []
        })

        for (let numMints = 1; numMints <= 2; numMints++) itShouldNotSuccessfullyMint(numMints)
      })
    })

    describe('during public sale', function () {
      beforeEach(async function () {
        await contract.connect(owner).allowPublicMinting()
        proof = positions = []
      })

      for (let numMints = 1; numMints <= 5; numMints++) itShouldSuccessfullyMint(numMints)

      describe('when the number of mints is 6', function () {
        beforeEach(function () {
          numMints = 6
          value = price.mul(numMints)
        })

        it('does not mint to the recipient', async function () {
          try {
            await contract.connect(addr2).mint(addr1.address, numMints, proof, positions, { value })
          } catch (err) {}
          expect(await contract.balanceOf(addr1.address)).to.equal('0')
        })

        it('generates an error', async function () {
          try {
            await contract.connect(addr2).mint(addr1.address, numMints, proof, positions, { value })
            throw new Error('was not supposed to succeed')
          } catch (err) {
            error = err
          }
          expect(error.message).to.contain('Can mint a max of 5 during public sale')
        })
      })
    })

    describe('when sold out', function () {
      beforeEach(async function () {
        await massMint(maxMints)
        proof = positions = []
      })

      it('does not mint to the recipient and generates a soldout error', async function () {
        try {
          await contract.connect(addr2).mint(addr1.address, 1, proof, positions, { value })
        } catch (err) {
          error = err
        }
        expect(await contract.balanceOf(addr1.address)).to.equal('0')
        expect(error.message).to.contain('Soldout!')
      })
    })

    describe('when nearing the end of the mint', function () {
      beforeEach(async function () {
        await contract.allowPublicMinting()
        proof = positions = []
      })

      describe(`when supply has 4 left`, function () {
        beforeEach(async function () {
          await massMint(maxMints - 4)
        })

        for (let numMints = 1; numMints <= 4; numMints++) itShouldSuccessfullyMint(numMints)

        describe('when the number of mints is 5', function () {
          beforeEach(function () {
            numMints = 5
            value = price.mul(numMints)
          })

          it('does not mint to the recipient', async function () {
            try {
              await contract.connect(addr2).mint(addr1.address, numMints, proof, positions, { value })
            } catch (err) {}
            expect(await contract.balanceOf(addr1.address)).to.equal('0')
          })

          it('generates an error', async function () {
            try {
              await contract.connect(addr2).mint(addr1.address, numMints, proof, positions, { value })
              throw new Error('was not supposed to succeed')
            } catch (err) {
              error = err
            }
            expect(error.message).to.contain('Not enough mints left.')
          })
        })
      })

      describe(`when supply has 3 left`, function () {
        beforeEach(async function () {
          await massMint(maxMints - 3)
        })

        for (let numMints = 1; numMints <= 3; numMints++) itShouldSuccessfullyMint(numMints)

        describe('when the number of mints is 4', function () {
          beforeEach(function () {
            numMints = 4
            value = price.mul(numMints)
          })

          it('does not mint to the recipient', async function () {
            try {
              await contract.connect(addr2).mint(addr1.address, numMints, proof, positions, { value })
            } catch (err) {}
            expect(await contract.balanceOf(addr1.address)).to.equal('0')
          })

          it('generates an error', async function () {
            try {
              await contract.connect(addr2).mint(addr1.address, numMints, proof, positions, { value })
              throw new Error('was not supposed to succeed')
            } catch (err) {
              error = err
            }
            expect(error.message).to.contain('Not enough mints left.')
          })
        })
      })

      describe(`when supply has 2 left`, function () {
        beforeEach(async function () {
          await massMint(maxMints - 2)
        })

        for (let numMints = 1; numMints <= 2; numMints++) itShouldSuccessfullyMint(numMints)

        describe('when the number of mints is 3', function () {
          beforeEach(function () {
            numMints = 3
            value = price.mul(numMints)
          })

          it('does not mint to the recipient', async function () {
            try {
              await contract.connect(addr2).mint(addr1.address, numMints, proof, positions, { value })
            } catch (err) {}
            expect(await contract.balanceOf(addr1.address)).to.equal('0')
          })

          it('generates an error', async function () {
            try {
              await contract.connect(addr2).mint(addr1.address, numMints, proof, positions, { value })
              throw new Error('was not supposed to succeed')
            } catch (err) {
              error = err
            }
            expect(error.message).to.contain('Not enough mints left.')
          })
        })
      })

      describe(`when supply has 1 left`, function () {
        beforeEach(async function () {
          await massMint(maxMints - 1)
        })

        itShouldSuccessfullyMint(1)

        describe('when the number of mints is 2', function () {
          beforeEach(function () {
            numMints = 2
            value = price.mul(numMints)
          })

          it('does not mint to the recipient', async function () {
            try {
              await contract.connect(addr2).mint(addr1.address, numMints, proof, positions, { value })
            } catch (err) {}
            expect(await contract.balanceOf(addr1.address)).to.equal('0')
          })

          it('generates an error', async function () {
            try {
              await contract.connect(addr2).mint(addr1.address, numMints, proof, positions, { value })
              throw new Error('was not supposed to succeed')
            } catch (err) {
              error = err
            }
            expect(error.message).to.contain('Not enough mints left.')
          })
        })
      })
    })
  })

  describe('when public minting is not allowed', function () {
    describe('when the address is whitelisted', function () {
      beforeEach(function () {
        const whitelistedAddresses = Array.from({ length: 100 }, () => ethers.Wallet.createRandom().address).concat(
          addr1.address
        )
        tree = createWhitelistTree(whitelistedAddresses)
      })

      it('allows the address to mint', async function () {
        const { proof, positions } = getWhitelistParams(addr1.address, tree)
        await contract.connect(owner).updateWhitelist(rootFrom(tree))
        await contract.connect(addr1).mint(addr1.address, 1, proof, positions, { value: price })

        expect(await contract.balanceOf(addr1.address)).to.equal('1')
      })
    })

    describe('when the address is not whitelisted', function () {
      it('fails to mint', async function () {
        try {
          await contract.connect(addr1).mint(addr1.address, 1, [], [], { value: price })
        } catch (err) {
          error = err
        }
        expect(error.message).to.contain('Not on whitelist.')
        expect(await contract.balanceOf(addr1.address)).to.equal('0')
      })
    })

    describe('re-enabling public mint', function () {
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

        await contract.connect(addr1).mint(addr1.address, 1, [], [], { value: price })
        expect(await contract.balanceOf(addr1.address)).to.equal('1')
      })
    })
  })

  describe('when public minting is allowed', function () {
    beforeEach(async function () {
      await contract.connect(owner).allowPublicMinting()
    })

    describe('when the address is whitelisted', function () {
      beforeEach(function () {
        const whitelistedAddresses = Array.from({ length: 100 }, () => ethers.Wallet.createRandom().address).concat(
          addr1.address
        )
        tree = createWhitelistTree(whitelistedAddresses)
      })

      it('allows the address to mint', async function () {
        const { proof, positions } = getWhitelistParams(addr1.address, tree)
        await contract.connect(owner).updateWhitelist(rootFrom(tree))
        await contract.connect(addr1).mint(addr1.address, 1, proof, positions, { value: price })

        expect(await contract.balanceOf(addr1.address)).to.equal('1')
      })
    })

    describe('when the address is not whitelisted', function () {
      it('allows the address to mint', async function () {
        const { proof, positions } = getWhitelistParams(addr1.address, tree)
        await contract.connect(owner).updateWhitelist(rootFrom(tree))
        await contract.connect(addr1).mint(addr1.address, 1, proof, positions, { value: price })

        expect(await contract.balanceOf(addr1.address)).to.equal('1')
      })
    })

    describe('disabling public mint', function () {
      it('fails if the caller does not have admin role', async function () {
        try {
          await contract.connect(addr1).disallowPublicMinting()
          throw new Error('was not supposed to succeed')
        } catch (err) {
          error = err
        }
        expect(error.message).to.contain('Must be an admin')
        expect(await contract.isPublicMintingAllowed()).to.equal(true)
      })

      it('closes the public mint if the caller has admin role', async function () {
        try {
          await contract.connect(owner).disallowPublicMinting()
        } catch (err) {
          error = err
        }
        expect(error).to.be.undefined
        expect(await contract.isPublicMintingAllowed()).to.equal(false)
      })

      it('disallows public minting', async function () {
        try {
          await contract.connect(owner).disallowPublicMinting()
          await contract.connect(addr1).mint(addr1.address, 1, [], [], { value: price })
        } catch (err) {
          error = err
        }
        expect(error.message).to.contain('Not on whitelist.')
        expect(await contract.balanceOf(addr1.address)).to.equal('0')
      })
    })
  })

  describe('tokenURI', function () {
    beforeEach(async function () {
      // Mint a few pieces
      await contract.connect(owner).allowPublicMinting()
      await massMint(3)
    })

    it('returns the correct IPFS url for a minted token', async function () {
      expect(await contract.tokenURI(1)).to.equal(`${baseURI}1`)
      expect(await contract.tokenURI(2)).to.equal(`${baseURI}2`)
      expect(await contract.tokenURI(3)).to.equal(`${baseURI}3`)
    })

    it('throws an error for an unminted token', async function () {
      try {
        await contract.tokenURI(4)
        throw new Error('was not supposed to succeed')
      } catch (err) {
        error = err
      }
      expect(error.message).to.contain('URI query for nonexistent token')
    })
  })
})
