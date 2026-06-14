// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IExtendedResolver {
    function resolve(bytes memory name, bytes memory data)
        external
        view
        returns (bytes memory);
}

/**
 * Phora offchain ENS resolver (EIP-3668 CCIP-Read + ENSIP-10 wildcard).
 *
 * Set as the resolver for phora.eth, it serves every *.phora.eth subname offchain:
 * `resolve(name, data)` reverts with OffchainLookup pointing at the Phora gateway,
 * which answers from the live attestation registry and signs the response. This
 * contract then recovers the signer and checks it is trusted — so the registry,
 * not the chain, is the source of truth, with no per-subname gas.
 *
 * `url` and `signers` are owner-settable, so the gateway can move (e.g. localhost →
 * a deployed URL) without redeploying. Signature scheme matches ENS SignatureVerifier.
 */
contract PhoraOffchainResolver is IExtendedResolver {
    string public url;
    mapping(address => bool) public signers;
    address public owner;

    error OffchainLookup(
        address sender,
        string[] urls,
        bytes callData,
        bytes4 callbackFunction,
        bytes extraData
    );

    constructor(string memory _url, address _signer) {
        owner = msg.sender;
        url = _url;
        signers[_signer] = true;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    function setURL(string calldata _url) external onlyOwner {
        url = _url;
    }

    function setSigner(address _signer, bool _ok) external onlyOwner {
        signers[_signer] = _ok;
    }

    function supportsInterface(bytes4 id) external pure returns (bool) {
        return id == type(IExtendedResolver).interfaceId || id == 0x01ffc9a7;
    }

    function resolve(bytes calldata name, bytes calldata data)
        external
        view
        override
        returns (bytes memory)
    {
        bytes memory callData = abi.encodeWithSelector(
            IExtendedResolver.resolve.selector,
            name,
            data
        );
        string[] memory urls = new string[](1);
        urls[0] = url;
        revert OffchainLookup(
            address(this),
            urls,
            callData,
            this.resolveWithProof.selector,
            abi.encode(callData, address(this))
        );
    }

    function resolveWithProof(bytes calldata response, bytes calldata extraData)
        external
        view
        returns (bytes memory)
    {
        (bytes memory result, uint64 expires, bytes memory sig) = abi.decode(
            response,
            (bytes, uint64, bytes)
        );
        (bytes memory request, address target) = abi.decode(
            extraData,
            (bytes, address)
        );
        require(expires >= block.timestamp, "signature expired");
        bytes32 h = keccak256(
            abi.encodePacked(
                hex"1900",
                target,
                expires,
                keccak256(request),
                keccak256(result)
            )
        );
        require(signers[_recover(h, sig)], "invalid signature");
        return result;
    }

    function _recover(bytes32 hash, bytes memory sig) internal pure returns (address) {
        require(sig.length == 65, "bad sig length");
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(sig, 0x20))
            s := mload(add(sig, 0x40))
            v := byte(0, mload(add(sig, 0x60)))
        }
        return ecrecover(hash, v, r, s);
    }
}
