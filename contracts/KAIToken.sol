// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title KAI Token - Africa's Resilience Infrastructure Token
 * @notice Utility token powering 7 pillars: Climate, Agriculture, Health, Law, Governance, Disaster, AI
 * @dev ERC-20 with burn mechanisms, role-based access, and deflationary utility
 *
 * Business Model:
 * - Climate alerts require KAI staking (10% burn on subscription)
 * - Agricultural insurance triggers burns (5% on payouts)
 * - Food safety certification fees (15% burn)
 * - DAO governance votes (2% burn)
 *
 * Sacred Encoding: Contract embeds 7-pillar wisdom in hex constants
 */
contract KAIToken is ERC20, ERC20Burnable, Pausable, AccessControl {
    // Role definitions
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");

    // Sacred constants - 7 Pillars encoded (hidden in plain sight)
    bytes7 private constant PILLAR_MATRIX = 0x47414C4841494B; // G,A,L,H,A,I,K (7 pillars)

    // Token economics
    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 10**18; // 1 billion KAI
    uint256 public constant INITIAL_MINT = 400_000_000 * 10**18; // 40% community

    // Burn tracking for analytics
    uint256 public totalBurned;
    mapping(address => uint256) public burnedByAddress;

    // Pillar-specific burn rates (basis points, 100 = 1%)
    mapping(uint8 => uint16) public pillarBurnRates;

    // SECURITY FIX: Oracle mint rate limiting
    uint256 public constant ORACLE_MINT_LIMIT_PER_DAY = 10_000_000 * 10**18; // 10M KAI max per day
    mapping(uint256 => uint256) public dailyOracleMints; // day => amount minted

    // Events
    event PillarBurn(address indexed user, uint8 indexed pillarId, uint256 amount, string reason);
    event OracleTriggered(uint8 indexed pillarId, address indexed recipient, uint256 amount);

    /**
     * @dev Constructor initializes KAI token with roles and pillar burn rates
     * @param admin Address that receives admin role
     * @param treasury Address that receives initial community allocation
     */
    constructor(address admin, address treasury) ERC20("KAI Coin", "KAI") {
        require(admin != address(0), "KAI: admin is zero address");
        require(treasury != address(0), "KAI: treasury is zero address");

        // Grant roles
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
        _grantRole(BURNER_ROLE, admin);
        _grantRole(ORACLE_ROLE, admin);

        // Set pillar burn rates (basis points)
        pillarBurnRates[1] = 1000; // Climate alerts: 10%
        pillarBurnRates[2] = 500;  // Agriculture insurance: 5%
        pillarBurnRates[3] = 1500; // Food certification: 15%
        pillarBurnRates[4] = 200;  // Governance votes: 2%
        pillarBurnRates[5] = 800;  // Law/audit: 8%
        pillarBurnRates[6] = 1200; // Disaster response: 12%
        pillarBurnRates[7] = 600;  // AI compute: 6%

        // Mint initial supply to treasury
        _mint(treasury, INITIAL_MINT);
    }

    /**
     * @dev Pillar-specific burn for utility flywheel
     * @param from Address to burn from (must have approved caller)
     * @param amount Amount to burn
     * @param pillarId Pillar ID (1-7)
     * @param reason Human-readable burn reason
     * @notice SECURITY FIX: Now requires ERC-20 approval from `from` address
     */
    function burnForPillar(
        address from,
        uint256 amount,
        uint8 pillarId,
        string calldata reason
    ) external onlyRole(BURNER_ROLE) whenNotPaused {
        require(pillarId >= 1 && pillarId <= 7, "KAI: invalid pillar");
        require(amount > 0, "KAI: amount is zero");
        require(balanceOf(from) >= amount, "KAI: insufficient balance");

        // Calculate burn amount based on pillar rate
        uint256 burnAmount = (amount * pillarBurnRates[pillarId]) / 10000;

        // SECURITY FIX: Require approval from token owner before burning
        // This prevents unauthorized burning of user tokens
        if (from != msg.sender) {
            uint256 currentAllowance = allowance(from, msg.sender);
            require(currentAllowance >= burnAmount, "KAI: burn amount exceeds allowance");
            _approve(from, msg.sender, currentAllowance - burnAmount);
        }

        // Burn tokens
        _burn(from, burnAmount);

        // Update tracking
        totalBurned += burnAmount;
        burnedByAddress[from] += burnAmount;

        emit PillarBurn(from, pillarId, burnAmount, reason);
    }

    /**
     * @dev Direct burn from contract's own balance (for staking/escrow contracts)
     * @param amount Exact amount to burn (no additional percentage applied)
     * @param pillarId Pillar ID for tracking
     * @param reason Burn reason for analytics
     * @notice This method burns the EXACT amount specified, unlike burnForPillar
     */
    function directBurn(
        uint256 amount,
        uint8 pillarId,
        string calldata reason
    ) external onlyRole(BURNER_ROLE) whenNotPaused {
        require(pillarId >= 1 && pillarId <= 7, "KAI: invalid pillar");
        require(amount > 0, "KAI: amount is zero");
        require(balanceOf(msg.sender) >= amount, "KAI: insufficient balance");

        // Burn exact amount from caller (staking contract)
        _burn(msg.sender, amount);

        // Update tracking
        totalBurned += amount;
        burnedByAddress[msg.sender] += amount;

        emit PillarBurn(msg.sender, pillarId, amount, reason);
    }

    /**
     * @dev Oracle-triggered mint for verified impact (e.g., disaster relief, insurance payout)
     * @param to Recipient address
     * @param amount Amount to mint
     * @param pillarId Pillar ID that triggered the mint
     * @notice SECURITY FIX: Added daily rate limiting to prevent infinite mint attacks
     */
    function oracleMint(
        address to,
        uint256 amount,
        uint8 pillarId
    ) external onlyRole(ORACLE_ROLE) whenNotPaused {
        require(pillarId >= 1 && pillarId <= 7, "KAI: invalid pillar");
        require(to != address(0), "KAI: mint to zero address");
        require(amount > 0, "KAI: amount is zero");
        require(totalSupply() + amount <= MAX_SUPPLY, "KAI: max supply exceeded");

        // SECURITY FIX: Daily rate limiting to prevent infinite mint attacks
        uint256 today = block.timestamp / 1 days;
        require(
            dailyOracleMints[today] + amount <= ORACLE_MINT_LIMIT_PER_DAY,
            "KAI: daily oracle mint limit exceeded"
        );
        dailyOracleMints[today] += amount;

        _mint(to, amount);

        emit OracleTriggered(pillarId, to, amount);
    }

    /**
     * @dev Update burn rate for a specific pillar (DAO governance)
     * @param pillarId Pillar ID (1-7)
     * @param newRate New burn rate in basis points
     */
    function updatePillarBurnRate(uint8 pillarId, uint16 newRate)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(pillarId >= 1 && pillarId <= 7, "KAI: invalid pillar");
        require(newRate <= 5000, "KAI: burn rate too high"); // Max 50%

        pillarBurnRates[pillarId] = newRate;
    }

    /**
     * @dev Pause token transfers (emergency only)
     */
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /**
     * @dev Unpause token transfers
     */
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /**
     * @dev Get circulating supply (total - burned)
     */
    function circulatingSupply() external view returns (uint256) {
        return totalSupply();
    }

    /**
     * @dev Get burn stats for analytics
     */
    function getBurnStats() external view returns (
        uint256 _totalBurned,
        uint256 _totalSupply,
        uint256 _percentBurned
    ) {
        _totalBurned = totalBurned;
        _totalSupply = totalSupply();
        _percentBurned = (_totalBurned * 10000) / INITIAL_MINT; // Basis points
    }

    /**
     * @dev Override _update to add pause functionality
     */
    function _update(
        address from,
        address to,
        uint256 value
    ) internal override whenNotPaused {
        super._update(from, to, value);
    }
}
