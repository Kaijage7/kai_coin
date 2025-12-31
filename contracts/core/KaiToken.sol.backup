// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title KaiToken
 * @dev KAI - Africa Resilience Token
 *
 * The core ERC-20 token powering the KAI ecosystem's 7 Pillars of Resilience:
 * Governance, Law, Agriculture, Health & Food Safety, AI, Disaster, Climate
 *
 * Features:
 * - ERC-20 with 18 decimals
 * - Burnable (deflationary mechanisms)
 * - Pausable (emergency controls)
 * - Permit (gasless approvals)
 * - Votes (governance integration)
 * - Role-based access control
 */
contract KaiToken is
    ERC20,
    ERC20Burnable,
    ERC20Pausable,
    ERC20Permit,
    ERC20Votes,
    AccessControl
{
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant PILLAR_ROLE = keccak256("PILLAR_ROLE");

    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 10**18; // 1 billion KAI
    uint256 public constant INITIAL_SUPPLY = 100_000_000 * 10**18; // 100 million KAI

    // Impact-tied inflation tracking
    uint256 public lastInflationTimestamp;
    uint256 public annualInflationBasisPoints; // Max 500 = 5%
    uint256 public constant MAX_INFLATION_BP = 500;
    uint256 public constant SECONDS_PER_YEAR = 365 days;

    // Burn tracking for transparency
    uint256 public totalBurned;

    // Events
    event InflationRateUpdated(uint256 oldRate, uint256 newRate);
    event ImpactMintExecuted(address indexed to, uint256 amount, string pillar);
    event EmergencyPause(address indexed by, string reason);

    constructor(
        address defaultAdmin,
        address treasury
    ) ERC20("KAI", "KAI") ERC20Permit("KAI") {
        require(defaultAdmin != address(0), "Invalid admin");
        require(treasury != address(0), "Invalid treasury");

        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
        _grantRole(MINTER_ROLE, defaultAdmin);
        _grantRole(PAUSER_ROLE, defaultAdmin);

        // Mint initial supply to treasury
        _mint(treasury, INITIAL_SUPPLY);

        lastInflationTimestamp = block.timestamp;
        annualInflationBasisPoints = 0; // Start with no inflation
    }

    /**
     * @dev Mint new tokens (impact-tied inflation)
     * Only callable by MINTER_ROLE, respects MAX_SUPPLY
     */
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        require(totalSupply() + amount <= MAX_SUPPLY, "Exceeds max supply");
        _mint(to, amount);
    }

    /**
     * @dev Impact-based minting for pillar rewards
     * Tracks which pillar triggered the mint for transparency
     */
    function impactMint(
        address to,
        uint256 amount,
        string calldata pillar
    ) external onlyRole(PILLAR_ROLE) {
        require(totalSupply() + amount <= MAX_SUPPLY, "Exceeds max supply");
        require(bytes(pillar).length > 0, "Pillar required");

        _mint(to, amount);
        emit ImpactMintExecuted(to, amount, pillar);
    }

    /**
     * @dev Update annual inflation rate (governance controlled)
     * Max 5% annually, tied to verified impact metrics
     */
    function setInflationRate(uint256 newRateBP) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newRateBP <= MAX_INFLATION_BP, "Rate exceeds maximum");

        uint256 oldRate = annualInflationBasisPoints;
        annualInflationBasisPoints = newRateBP;

        emit InflationRateUpdated(oldRate, newRateBP);
    }

    /**
     * @dev Calculate allowed inflation mint based on time elapsed
     */
    function calculateAllowedInflation() public view returns (uint256) {
        if (annualInflationBasisPoints == 0) return 0;

        uint256 timeElapsed = block.timestamp - lastInflationTimestamp;
        uint256 currentSupply = totalSupply();

        // Pro-rata inflation based on time elapsed
        uint256 annualInflation = (currentSupply * annualInflationBasisPoints) / 10000;
        uint256 allowedInflation = (annualInflation * timeElapsed) / SECONDS_PER_YEAR;

        // Respect max supply
        if (currentSupply + allowedInflation > MAX_SUPPLY) {
            return MAX_SUPPLY - currentSupply;
        }

        return allowedInflation;
    }

    /**
     * @dev Execute inflation mint (distributes to treasury)
     */
    function executeInflationMint(address treasury) external onlyRole(MINTER_ROLE) {
        uint256 amount = calculateAllowedInflation();
        require(amount > 0, "No inflation available");

        lastInflationTimestamp = block.timestamp;
        _mint(treasury, amount);
    }

    /**
     * @dev Emergency pause all transfers
     */
    function pause(string calldata reason) external onlyRole(PAUSER_ROLE) {
        _pause();
        emit EmergencyPause(msg.sender, reason);
    }

    /**
     * @dev Unpause transfers
     */
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /**
     * @dev Grant pillar contract permission to mint rewards
     */
    function grantPillarRole(address pillar) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(pillar != address(0), "Invalid pillar address");
        _grantRole(PILLAR_ROLE, pillar);
    }

    /**
     * @dev Revoke pillar contract permission
     */
    function revokePillarRole(address pillar) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(PILLAR_ROLE, pillar);
    }

    // Required overrides for multiple inheritance

    function _update(
        address from,
        address to,
        uint256 value
    ) internal override(ERC20, ERC20Pausable, ERC20Votes) {
        super._update(from, to, value);

        // Track burns (when to is zero address and from is not zero)
        if (to == address(0) && from != address(0)) {
            totalBurned += value;
        }
    }

    function nonces(
        address owner
    ) public view override(ERC20Permit, Nonces) returns (uint256) {
        return super.nonces(owner);
    }
}
