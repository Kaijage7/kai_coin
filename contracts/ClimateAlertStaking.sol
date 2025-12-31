// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./KAIToken.sol";

/**
 * @title Climate Alert Staking Contract
 * @notice Farmers/agencies stake KAI to receive AI-powered climate/disaster alerts
 * @dev Implements the utility flywheel: stake → alerts → burns → deflation
 *
 * Business Model:
 * - Users stake minimum 100 KAI to activate alerts
 * - AI oracle triggers alerts (floods, droughts, locusts, etc.)
 * - Successful alerts burn 10% of stake (deflationary mechanism)
 * - Users can unstake anytime (but lose alert access)
 *
 * Pilot Target: 10,000 Kenyan farmers (Q1 2026)
 */
contract ClimateAlertStaking is ReentrancyGuard, AccessControl, Pausable {
    KAIToken public immutable kaiToken;

    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    // Staking parameters
    uint256 public constant MIN_STAKE = 100 * 10**18; // 100 KAI minimum
    uint256 public constant ALERT_BURN_RATE = 1000; // 10% burn per alert (basis points)

    // Staking data
    struct Stake {
        uint256 amount;
        uint256 stakedAt;
        uint256 alertsReceived;
        uint256 totalBurned;
        bool active;
    }

    mapping(address => Stake) public stakes;
    uint256 public totalStaked;
    uint256 public totalAlertsSent;
    uint256 public totalUsers;

    // Alert tracking
    struct Alert {
        uint8 alertType; // 1=flood, 2=drought, 3=locust, 4=cyclone, etc.
        uint256 timestamp;
        string region;
        uint256 recipientCount;
    }

    mapping(uint256 => Alert) public alerts;
    uint256 public alertCount;

    // Events
    event Staked(address indexed user, uint256 amount, uint256 timestamp);
    event Unstaked(address indexed user, uint256 amount, uint256 timestamp);
    event AlertSent(
        uint256 indexed alertId,
        uint8 alertType,
        string region,
        uint256 recipientCount,
        uint256 totalBurned
    );
    event BurnExecuted(address indexed user, uint256 amount, uint256 alertId);

    /**
     * @dev Constructor
     * @param _kaiToken Address of KAI token contract
     * @param admin Address with admin role
     * @param oracle Address with oracle role (AI backend)
     */
    constructor(address _kaiToken, address admin, address oracle) {
        require(_kaiToken != address(0), "ClimateStake: invalid token");
        require(admin != address(0), "ClimateStake: invalid admin");
        require(oracle != address(0), "ClimateStake: invalid oracle");

        kaiToken = KAIToken(_kaiToken);

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        _grantRole(ORACLE_ROLE, oracle);
    }

    /**
     * @dev Stake KAI to activate climate alerts
     * @param amount Amount of KAI to stake (minimum 100)
     */
    function stake(uint256 amount) external nonReentrant whenNotPaused {
        require(amount >= MIN_STAKE, "ClimateStake: below minimum");
        require(
            kaiToken.balanceOf(msg.sender) >= amount,
            "ClimateStake: insufficient balance"
        );

        // ✅ FIX: Check approval before attempting transfer
        uint256 currentAllowance = kaiToken.allowance(msg.sender, address(this));
        require(
            currentAllowance >= amount,
            "ClimateStake: insufficient allowance. Call approve() first"
        );

        // Transfer tokens to contract
        require(
            kaiToken.transferFrom(msg.sender, address(this), amount),
            "ClimateStake: transfer failed"
        );

        // Update or create stake
        if (stakes[msg.sender].amount == 0) {
            totalUsers++;
        }

        stakes[msg.sender].amount += amount;
        stakes[msg.sender].stakedAt = block.timestamp;
        stakes[msg.sender].active = true;

        totalStaked += amount;

        emit Staked(msg.sender, amount, block.timestamp);
    }

    /**
     * @dev Unstake KAI and stop receiving alerts
     */
    function unstake() external nonReentrant {
        Stake storage userStake = stakes[msg.sender];
        require(userStake.amount > 0, "ClimateStake: no stake found");

        uint256 amount = userStake.amount;

        // Reset stake
        userStake.amount = 0;
        userStake.active = false;

        totalStaked -= amount;
        totalUsers--;

        // Return tokens
        require(
            kaiToken.transfer(msg.sender, amount),
            "ClimateStake: transfer failed"
        );

        emit Unstaked(msg.sender, amount, block.timestamp);
    }

    /**
     * @dev Oracle sends climate alert and burns from all active stakers in region
     * @param alertType Type of alert (1=flood, 2=drought, etc.)
     * @param region Geographic region (e.g., "Nairobi", "Lagos")
     * @param recipients Array of addresses in affected region
     */
    function sendAlert(
        uint8 alertType,
        string calldata region,
        address[] calldata recipients
    ) external onlyRole(ORACLE_ROLE) whenNotPaused {
        require(alertType >= 1 && alertType <= 10, "ClimateStake: invalid type");
        require(recipients.length > 0, "ClimateStake: no recipients");

        uint256 totalBurned = 0;
        uint256 validRecipients = 0;

        // Process burn for each active staker
        for (uint256 i = 0; i < recipients.length; i++) {
            address user = recipients[i];
            Stake storage userStake = stakes[user];

            if (userStake.active && userStake.amount > 0) {
                // Calculate burn amount (10% of stake)
                uint256 burnAmount = (userStake.amount * ALERT_BURN_RATE) / 10000;

                // Ensure burn amount doesn't exceed stake (safety check)
                require(burnAmount <= userStake.amount, "ClimateStake: burn exceeds stake");

                // ✅ FIX: Use directBurn() to burn exact amount from staking contract
                // Pillar 6 = Disaster/Climate alerts
                kaiToken.directBurn(burnAmount, 6, "Climate alert triggered");

                // Update user stats
                userStake.amount -= burnAmount;
                userStake.alertsReceived++;
                userStake.totalBurned += burnAmount;

                totalBurned += burnAmount;
                validRecipients++;

                emit BurnExecuted(user, burnAmount, alertCount);

                // Deactivate if stake falls below minimum
                if (userStake.amount < MIN_STAKE) {
                    userStake.active = false;
                    totalUsers--;
                }
            }
        }

        // Record alert
        alerts[alertCount] = Alert({
            alertType: alertType,
            timestamp: block.timestamp,
            region: region,
            recipientCount: validRecipients
        });

        totalAlertsSent += validRecipients;
        alertCount++;

        emit AlertSent(alertCount - 1, alertType, region, validRecipients, totalBurned);
    }

    /**
     * @dev Get user stake details
     */
    function getStake(address user)
        external
        view
        returns (
            uint256 amount,
            uint256 stakedAt,
            uint256 alertsReceived,
            uint256 totalBurned,
            bool active
        )
    {
        Stake memory userStake = stakes[user];
        return (
            userStake.amount,
            userStake.stakedAt,
            userStake.alertsReceived,
            userStake.totalBurned,
            userStake.active
        );
    }

    /**
     * @dev Get platform stats for analytics
     */
    function getPlatformStats()
        external
        view
        returns (
            uint256 _totalStaked,
            uint256 _totalUsers,
            uint256 _totalAlertsSent,
            uint256 _alertCount
        )
    {
        return (totalStaked, totalUsers, totalAlertsSent, alertCount);
    }

    /**
     * @dev Check if user has sufficient allowance to stake
     * @param user Address to check
     * @param amount Amount they want to stake
     * @return hasAllowance True if user has approved enough tokens
     * @return currentAllowance Current allowance amount
     * @return required Required allowance amount
     */
    function checkAllowance(address user, uint256 amount)
        external
        view
        returns (
            bool hasAllowance,
            uint256 currentAllowance,
            uint256 required
        )
    {
        currentAllowance = kaiToken.allowance(user, address(this));
        required = amount;
        hasAllowance = currentAllowance >= amount;
        return (hasAllowance, currentAllowance, required);
    }

    /**
     * @dev Pause contract (emergency only)
     */
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    /**
     * @dev Unpause contract
     */
    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }
}
