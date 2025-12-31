// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Utils.sol";

/**
 * @title KAI Token - Upgradeable Version (UUPS Proxy Pattern)
 * @author KAI Intelligence
 * @notice Africa Resilience Token - Upgradeable implementation
 * @dev Uses UUPS (EIP-1822) proxy pattern for upgradability
 *
 * Benefits of UUPS:
 * - Cheaper deployment (logic in implementation, not proxy)
 * - Upgrade logic in implementation (safer)
 * - Can remove upgradeability later if desired
 *
 * Upgrade process:
 * 1. Deploy new implementation
 * 2. Call upgradeTo(newImplementation) from UPGRADER_ROLE
 * 3. Storage layout must be compatible!
 */
contract KAITokenUpgradeable is
    Initializable,
    ERC20Upgradeable,
    ERC20BurnableUpgradeable,
    ERC20PausableUpgradeable,
    AccessControlUpgradeable,
    UUPSUpgradeable
{
    // ============================================
    // ROLES
    // ============================================

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    // ============================================
    // STATE VARIABLES
    // ============================================

    /// @notice Total tokens burned (cumulative)
    uint256 public totalBurned;

    /// @notice Tokens burned per address
    mapping(address => uint256) public burnedByAddress;

    /// @notice Pillar-specific burn rates (basis points: 100 = 1%)
    mapping(uint8 => uint256) public pillarBurnRates;

    /// @notice Contract version for upgrade tracking
    uint256 public version;

    /// @notice Gap for future storage variables
    uint256[50] private __gap;

    // ============================================
    // EVENTS
    // ============================================

    event PillarBurn(
        address indexed burner,
        uint8 indexed pillarId,
        uint256 amount,
        string reason
    );

    event ContractUpgraded(uint256 newVersion, address newImplementation);

    // ============================================
    // INITIALIZER (replaces constructor)
    // ============================================

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize the contract (called once via proxy)
     * @param admin Address to receive admin role and initial supply
     */
    function initialize(address admin) public initializer {
        require(admin != address(0), "Invalid admin");

        __ERC20_init("KAI Africa Resilience Token", "KAI");
        __ERC20Burnable_init();
        __ERC20Pausable_init();
        __AccessControl_init();
        __UUPSUpgradeable_init();

        // Grant roles
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
        _grantRole(BURNER_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _grantRole(UPGRADER_ROLE, admin);

        // Mint initial supply (1 billion tokens)
        _mint(admin, 1_000_000_000 * 10 ** decimals());

        // Initialize pillar burn rates
        _initializePillarBurnRates();

        version = 1;
    }

    /**
     * @dev Initialize pillar burn rates
     */
    function _initializePillarBurnRates() internal {
        pillarBurnRates[1] = 200;  // Climate: 2%
        pillarBurnRates[2] = 150;  // Agriculture: 1.5%
        pillarBurnRates[3] = 300;  // Health: 3%
        pillarBurnRates[4] = 100;  // Law: 1%
        pillarBurnRates[5] = 250;  // Governance: 2.5%
        pillarBurnRates[6] = 500;  // Disaster: 5%
        pillarBurnRates[7] = 200;  // AI: 2%
    }

    // ============================================
    // MINTING
    // ============================================

    /**
     * @notice Mint new tokens
     * @param to Recipient address
     * @param amount Amount to mint
     */
    function mint(address to, uint256 amount)
        external
        onlyRole(MINTER_ROLE)
        whenNotPaused
    {
        _mint(to, amount);
    }

    // ============================================
    // BURNING
    // ============================================

    /**
     * @notice Burn tokens for a specific pillar
     * @param amount Amount to burn
     * @param pillarId Pillar identifier (1-7)
     * @param reason Description of burn reason
     */
    function directBurn(uint256 amount, uint8 pillarId, string calldata reason)
        external
        onlyRole(BURNER_ROLE)
        whenNotPaused
    {
        require(pillarId >= 1 && pillarId <= 7, "KAI: invalid pillar");
        require(amount > 0, "KAI: amount is zero");
        require(balanceOf(msg.sender) >= amount, "KAI: insufficient balance");

        _burn(msg.sender, amount);
        totalBurned += amount;
        burnedByAddress[msg.sender] += amount;

        emit PillarBurn(msg.sender, pillarId, amount, reason);
    }

    /**
     * @notice Get burn rate for a pillar
     * @param pillarId Pillar identifier (1-7)
     * @return Burn rate in basis points
     */
    function getPillarBurnRate(uint8 pillarId) external view returns (uint256) {
        require(pillarId >= 1 && pillarId <= 7, "Invalid pillar");
        return pillarBurnRates[pillarId];
    }

    /**
     * @notice Update burn rate for a pillar
     * @param pillarId Pillar identifier (1-7)
     * @param newRate New burn rate in basis points
     */
    function setPillarBurnRate(uint8 pillarId, uint256 newRate)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(pillarId >= 1 && pillarId <= 7, "Invalid pillar");
        require(newRate <= 1000, "Rate too high (max 10%)");
        pillarBurnRates[pillarId] = newRate;
    }

    // ============================================
    // PAUSE FUNCTIONALITY
    // ============================================

    /**
     * @notice Pause all token transfers
     */
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /**
     * @notice Unpause token transfers
     */
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // ============================================
    // UPGRADABILITY
    // ============================================

    /**
     * @notice Authorize contract upgrade
     * @param newImplementation Address of new implementation
     */
    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(UPGRADER_ROLE)
    {
        version++;
        emit ContractUpgraded(version, newImplementation);
    }

    /**
     * @notice Get current implementation address
     */
    function getImplementation() external view returns (address) {
        return ERC1967Utils.getImplementation();
    }

    // ============================================
    // REQUIRED OVERRIDES
    // ============================================

    function _update(address from, address to, uint256 value)
        internal
        override(ERC20Upgradeable, ERC20PausableUpgradeable)
    {
        super._update(from, to, value);
    }
}

/**
 * @title KAI Token V2 (Example Upgrade)
 * @dev Example of how to create an upgraded version
 *
 * IMPORTANT: Storage layout must be compatible!
 * - Can add new state variables at the end
 * - Cannot remove or reorder existing variables
 * - Cannot change types of existing variables
 */
contract KAITokenUpgradeableV2 is KAITokenUpgradeable {

    // New state variable (added at end, uses gap)
    uint256 public newFeatureEnabled;

    /**
     * @notice Reinitialize for V2 (called once after upgrade)
     */
    function initializeV2() external reinitializer(2) {
        newFeatureEnabled = 1;
        // Add V2-specific initialization here
    }

    /**
     * @notice New feature added in V2
     */
    function newV2Feature() external view returns (string memory) {
        return "This is a V2 feature!";
    }
}
