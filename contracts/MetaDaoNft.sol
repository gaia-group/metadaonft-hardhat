// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import './utils/MerkleProof.sol';
import './utils/Base64.sol';
import '@openzeppelin/contracts/access/AccessControlEnumerable.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/utils/Strings.sol';
import '@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol';

/**
 *  @title Meta DAO NFT
 *
 *  @notice This implements the contract for the Meta DAO NFT. Admins can
 *  and change the number of mints with a hard cap of 10,000 total mints.
 *  Contract can be paused by changing max mints to be less than current supply.
 *  Funds from sales can be withdrawn any time - 75% sent to the DAO wallet, and
 *  the remaining 25% split evenly among founding member wallets.
 */

contract MetaDaoNft is ERC721Enumerable, Ownable, AccessControlEnumerable {
    /// @dev Used to convert tokenId to string for on-chain static metadata
    using Strings for uint256;

    /// @dev The price of a single mint in Ether
    uint256 public constant PRICE = 0.04 ether;

    /// @dev Hard cap on the maximum number of mints. No one can set max mints higher than the hard cap.
    uint256 public constant MAX_MINTS = 4444;

    /// @dev A role for people who are project founders.
    bytes32 public constant FOUNDER_ROLE = keccak256('FOUNDER_ROLE');

    /// @dev A role for the artist.
    bytes32 public constant ARTIST_ROLE = keccak256('ARTIST_ROLE');

    /**
     * @dev Indicates if public minting is opened. If true, addresses not on the
     * whitelist can mint tokens. If false, the address must be on the whitelist
     * to mint.
     */
    bool public isPublicMintingAllowed;

    /**
     *  @dev A merkle tree root for the whitelist. The merkle tree is generated
     * off-chain to save gas, and the root is stored on contract for verification.
     */
    bytes32 private _whitelistMerkleRoot;

    /// @dev The  baseTokenURI that is used for all mints.
    string private _baseTokenURI;

    /// @dev An event emitted when the mint was successful.
    event SuccessfulMint(uint256 tokenId, address recipient);

    /// @dev Gates functions that should only be called by the contract admins.
    modifier onlyAdmin() {
        require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), 'Must be an admin.');
        _; // Executes the rest of the modified function
    }

    /**
     * @notice Deploys the contract, sets the baseTokenURI, sets the the max
     * mints, roles for founders and disables public minting.
     *
     * @param founders The addresses of founders to be granted founder role.
     * @param artist The address of the artist to be granted artist role.
     */
    constructor(address[] memory founders, address artist) ERC721('Meta DAO NFT', 'METADAONFT') {
        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
        disallowPublicMinting();

        _setupRole(ARTIST_ROLE, artist);
        for (uint256 i = 0; i < founders.length; i++) {
            _setupRole(FOUNDER_ROLE, founders[i]);
        }
    }

    /**
     * @notice Retrieves the tokenURI for a provided tokenid.
     *
     * @param tokenId The tokenId of the token to fetch the tokenURI.
     *
     * @return The tokenURI for the given tokenId. All token IDs have the same metadata, with the exception of the ID
     */
    function tokenURI(uint256 tokenId) public pure override returns (string memory) {
        // FIXME: Return token URI to JSON on IPFS
        string memory json = Base64.encode(
            bytes(
                string(
                    abi.encodePacked(
                        '{"name": "Meta DAO #',
                        tokenId.toString(),
                        '", "description": "A collectible piece of land artwork, crafted by 8thproject, that you can treasure on the blockchain forever.", "image": "https://ipfs.io/ipfs/Qmf1EruEbcdwfghq34RoWNgeh9edZSGKsAckk3nD6MrrvC"}'
                    )
                )
            )
        );
        return string(abi.encodePacked('data:application/json;base64,', json));
    }

    /**
     * @notice Admin-only function to set the whitelist with a merkle root that
     * is generated off-chain.
     *
     * @param whitelistMerkleRoot An off-chain-generated merkle root for a list
     * of addresses that should be whitelisted. For more info on generating
     * merkle roots off chain for this contract, see:
     * https://dev.to/0xmojo7/merkle-tree-solidity-sc-validation-568m
     */

    function updateWhitelist(bytes32 whitelistMerkleRoot) public onlyAdmin {
        _whitelistMerkleRoot = whitelistMerkleRoot;
    }

    /**
     * @notice Verifies the whitelist status of a recipient address.
     * @dev To generate the parameters for this function, see:
     * https://dev.to/0xmojo7/merkle-tree-solidity-sc-validation-568m
     * https://github.com/miguelmota/merkletreejs/
     *
     * @param recipient The address to check.
     * @param _proof Array of hex values denoting the kekkack hashes of leaves
     * in the merkle root tree leading to verified address.
     * @param _positions Array of string values of 'left' or 'right' denoting the
     * position of the address in the corresponding _proof array to navigate to
     * the verifiable address.
     *
     * @return True if the address is whitelisted, false otherwise.
     */
    function verifyWhitelist(
        address recipient,
        bytes32[] memory _proof,
        uint256[] memory _positions
    ) public view returns (bool) {
        if (_proof.length == 0 || _positions.length == 0) {
            return false;
        } else {
            bytes32 _leaf = keccak256(abi.encodePacked(recipient));
            return MerkleProof.verify(_whitelistMerkleRoot, _leaf, _proof, _positions);
        }
    }

    /**
     * @notice Mints a new token for the recipient.
     *
     * @param recipient The address to receive the newly minted tokens
     * @param numMints The number of mints to mint
     * @param _proof Array of hex values denoting the kekkack hashes of leaves
     * in the merkle root tree leading to verified address. Used to verify the
     * recipient is whitelisted, if minting during whitelist period.
     * @param _positions Array of string values of 'left' or 'right' denoting the
     * position of the address in the corresponding _proof array to navigate to
     * the verifiable address. Used to verify the is whitelisted, if minting
     * during whitelist period.
     */
    function mint(
        address recipient,
        uint8 numMints,
        bytes32[] memory _proof,
        uint256[] memory _positions
    ) public payable {
        require(numMints > 0, 'Must provide an amount to mint.');
        require(totalSupply() < MAX_MINTS, 'Soldout!');

        if (!hasRole(DEFAULT_ADMIN_ROLE, _msgSender())) {
            require(msg.value >= PRICE * numMints, 'Value below price');

            if (isPublicMintingAllowed) {
                require(numMints <= 5, 'Can mint a max of 5 during public sale');
            } else {
                require(verifyWhitelist(_msgSender(), _proof, _positions), 'Not on whitelist.');
                require(numMints <= 2, 'Can mint a max of 2 during presale');
            }
        }

        for (uint256 i = 0; i < numMints; i++) {
            _mintAnElement(recipient);
        }
    }

    /**
     * @notice Enables public minting. When enabled, addresses that are not on
     * the whitelist are able to mint.
     */
    function allowPublicMinting() public onlyAdmin {
        isPublicMintingAllowed = true;
    }

    /**
     * @notice Enables public minting. When enabled, addresses that are not on
     * the whitelist are able to mint.
     */
    function disallowPublicMinting() public onlyAdmin {
        isPublicMintingAllowed = false;
    }

    /**
     * @dev {ERC721Pausable-beforeTokenTransfer} and {ERC721Enumerable-beforeTokenTransfer}
     * both implement _beforeTokenTransfer, and we want their implementations
     * to both be called. This function is used to call both of them whenever
     * _beforeTokenTransfer is called.
     *
     * @param from The sender of the token.
     * @param to The recipient of the token.
     * @param tokenId The ID of the token to be transferred.
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId
    ) internal override(ERC721Enumerable) {
        super._beforeTokenTransfer(from, to, tokenId);
    }

    /**
     * @dev All interfaces need to support `supportsInterface`. This function
     * checks if the provided interface ID is supported.
     *
     * @param interfaceId The interface ID to check.
     *
     * @return True if the interface is supported (AccessControlEnumerable,
     * ERC721, ERC721Enumerable), false otherwise.
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(AccessControlEnumerable, ERC721Enumerable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    /**
     * @dev Private function to encapsulate the logic of minting an element.
     * Whenever a new mint is created, the `SuccessfulMint` event is emitted
     * with the tokenId and the address of the recipient.
     *
     *
     * @param recipient The address to receive the newly minted tokens
     *
     */
    function _mintAnElement(address recipient) private {
        uint256 tokenId = totalSupply() + 1;
        _safeMint(recipient, tokenId);
        emit SuccessfulMint(tokenId, recipient);
    }

    /**
     * @notice Withdraws all funds from contract address. Founders get 90%,
     * artist gets remaining 10%.
     *
     */
    function withdrawAll() public onlyAdmin {
        uint256 balance = address(this).balance;
        uint256 founderCount = getRoleMemberCount(FOUNDER_ROLE);
        require(balance > 0, 'Nothing to withdraw.');

        // 90% split between founders
        uint256 founderBalance = (balance * 9) / 10;
        for (uint256 i = 0; i < founderCount; i++) {
            address member = getRoleMember(FOUNDER_ROLE, i);
            _withdraw(member, founderBalance / founderCount);
        }

        uint256 artistBalance = address(this).balance; // Should be the remaining 10%.
        address artist = getRoleMember(ARTIST_ROLE, 0);
        _withdraw(artist, artistBalance);
    }

    /**
     * @dev Encapsulates the logic of withdrawing funds from the contract to
     * a given address.
     *
     * @param recipient The address to receive the funds.
     * @param amount The amount of funds to be withdrawn.
     */
    function _withdraw(address recipient, uint256 amount) private {
        (bool success, ) = recipient.call{value: amount}('');
        require(success, 'Transfer failed.');
    }
}
