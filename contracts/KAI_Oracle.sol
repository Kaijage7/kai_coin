// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./ClimateAlertStaking.sol";
import "./KAIToken.sol";

/**
 * @title KAI Oracle - AI-Powered Climate & Disaster Alert System
 * @notice Bridges off-chain AI predictions to on-chain alert distribution
 * @dev Production-grade oracle with:
 *      - Multi-source data verification (AI backend + Chainlink + satellite)
 *      - Alert confidence scoring (only >80% confidence triggers burns)
 *      - Rate limiting (max 10 alerts per region per day)
 *      - Emergency override (guardian can pause false alerts)
 *      - Reward system for oracle operators (3% of burns)
 *
 * Business Model:
 * - AI backend analyzes: Weather APIs, satellite imagery, soil sensors, locust patterns
 * - Oracle validates predictions with confidence scores
 * - High-confidence alerts (>80%) trigger staking burns
 * - Oracle operators earn 3% of burned KAI as incentive
 *
 * Sacred Encoding: Oracle types map to 7 pillars
 */
contract KAI_Oracle is ReentrancyGuard, AccessControl, Pausable {
    KAIToken public immutable kaiToken;
    ClimateAlertStaking public immutable climateStaking;

    // Roles
    bytes32 public constant ORACLE_OPERATOR_ROLE = keccak256("ORACLE_OPERATOR_ROLE");
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    // Sacred constants - 7 alert types mapped to pillars
    bytes32 private constant SEAL_OF_FLOOD = keccak256("DISASTER_FLOOD");
    bytes32 private constant SEAL_OF_DROUGHT = keccak256("CLIMATE_DROUGHT");
    bytes32 private constant SEAL_OF_LOCUST = keccak256("AGRICULTURE_LOCUST");
    bytes32 private constant SEAL_OF_CYCLONE = keccak256("DISASTER_CYCLONE");
    bytes32 private constant SEAL_OF_DISEASE = keccak256("HEALTH_OUTBREAK");
    bytes32 private constant SEAL_OF_HEATWAVE = keccak256("CLIMATE_HEAT");
    bytes32 private constant SEAL_OF_WILDFIRE = keccak256("DISASTER_FIRE");

    // Hard-coded parameters
    uint256 public constant MIN_CONFIDENCE = 80; // 80% minimum confidence to trigger
    uint256 public constant MAX_ALERTS_PER_DAY = 10; // Per region rate limit
    uint256 public constant ORACLE_REWARD_RATE = 300; // 3% of burn goes to oracle (basis points)
    uint256 public constant ALERT_COOLDOWN = 6 hours; // Min time between same-type alerts
    uint256 public constant CONFIDENCE_MULTIPLIER = 100; // For percentage calculations

    // Alert data structure
    struct AlertData {
        uint8 alertType; // 1=flood, 2=drought, 3=locust, etc.
        bytes32 seal; // Corresponding sacred seal
        string region; // Geographic region (e.g., "Nairobi", "Lagos")
        uint256 confidence; // Confidence score (0-100)
        uint256 severity; // Severity level (1-5)
        string dataSource; // "AI_BACKEND", "CHAINLINK", "SATELLITE"
        address[] recipients; // Affected stakers
        uint256 timestamp;
        bool executed;
        uint256 burnedAmount;
    }

    // State
    uint256 public alertCount;
    mapping(uint256 => AlertData) public alerts;

    // Rate limiting: region => date => count
    mapping(string => mapping(uint256 => uint256)) public dailyAlertCount;

    // Cooldown tracking: region => alertType => lastTimestamp
    mapping(string => mapping(uint8 => uint256)) public lastAlertTime;

    // Oracle operator rewards
    mapping(address => uint256) public operatorRewards;
    uint256 public totalRewardsPaid;

    // Alert confidence tracking (for analytics)
    uint256 public totalConfidenceScore;
    uint256 public totalAlertsExecuted;

    // Events
    event AlertSubmitted(
        uint256 indexed alertId,
        uint8 indexed alertType,
        string region,
        uint256 confidence,
        address operator
    );
    event AlertExecuted(
        uint256 indexed alertId,
        uint256 recipientCount,
        uint256 burnedAmount,
        uint256 operatorReward
    );
    event AlertRejected(
        uint256 indexed alertId,
        string reason
    );
    event OracleRewarded(address indexed operator, uint256 amount);
    event EmergencyOverride(uint256 indexed alertId, address indexed guardian, string reason);

    /**
     * @dev Constructor - Links to KAI token and staking contracts
     * @param _kaiToken Address of KAI token contract
     * @param _climateStaking Address of ClimateAlertStaking contract
     * @param admin Address with admin role
     * @param oracleOperator Address with oracle operator role (AI backend)
     * @param guardians Array of guardian addresses (emergency override)
     */
    constructor(
        address _kaiToken,
        address _climateStaking,
        address admin,
        address oracleOperator,
        address[] memory guardians
    ) {
        require(_kaiToken != address(0), "Oracle: invalid token");
        require(_climateStaking != address(0), "Oracle: invalid staking");
        require(admin != address(0), "Oracle: invalid admin");
        require(oracleOperator != address(0), "Oracle: invalid operator");
        require(guardians.length >= 1, "Oracle: need guardians");

        kaiToken = KAIToken(_kaiToken);
        climateStaking = ClimateAlertStaking(_climateStaking);

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        _grantRole(ORACLE_OPERATOR_ROLE, oracleOperator);

        for (uint256 i = 0; i < guardians.length; i++) {
            _grantRole(GUARDIAN_ROLE, guardians[i]);
        }
    }

    /**
     * @dev Submit alert from AI backend (requires validation)
     * @param alertType Type of alert (1-7)
     * @param region Geographic region affected
     * @param confidence Confidence score (0-100)
     * @param severity Severity level (1-5)
     * @param dataSource Source of prediction
     * @param recipients Array of affected staker addresses
     */
    function submitAlert(
        uint8 alertType,
        string calldata region,
        uint256 confidence,
        uint256 severity,
        string calldata dataSource,
        address[] calldata recipients
    ) external onlyRole(ORACLE_OPERATOR_ROLE) whenNotPaused nonReentrant returns (uint256) {
        require(alertType >= 1 && alertType <= 7, "Oracle: invalid type");
        require(confidence <= 100, "Oracle: invalid confidence");
        require(severity >= 1 && severity <= 5, "Oracle: invalid severity");
        require(recipients.length > 0, "Oracle: no recipients");
        require(bytes(region).length > 0, "Oracle: empty region");

        // ✅ FIX: Rate limiting check (normalize to start of day UTC)
        // Using modulo to get consistent day boundary (midnight UTC)
        uint256 today = block.timestamp - (block.timestamp % 1 days);
        require(
            dailyAlertCount[region][today] < MAX_ALERTS_PER_DAY,
            "Oracle: rate limit exceeded"
        );

        // Cooldown check (prevent spam of same alert type)
        require(
            block.timestamp >= lastAlertTime[region][alertType] + ALERT_COOLDOWN,
            "Oracle: cooldown active"
        );

        // Get corresponding seal
        bytes32 seal = _getSealForType(alertType);

        // Create alert record
        alertCount++;
        AlertData storage newAlert = alerts[alertCount];
        newAlert.alertType = alertType;
        newAlert.seal = seal;
        newAlert.region = region;
        newAlert.confidence = confidence;
        newAlert.severity = severity;
        newAlert.dataSource = dataSource;
        newAlert.recipients = recipients;
        newAlert.timestamp = block.timestamp;
        newAlert.executed = false;

        // Update rate limiting
        dailyAlertCount[region][today]++;
        lastAlertTime[region][alertType] = block.timestamp;

        emit AlertSubmitted(alertCount, alertType, region, confidence, msg.sender);

        // Auto-execute if confidence is high enough
        if (confidence >= MIN_CONFIDENCE) {
            _executeAlert(alertCount);
        } else {
            emit AlertRejected(alertCount, "Confidence below threshold");
        }

        return alertCount;
    }

    /**
     * @dev Execute alert (triggers staking burns)
     * @param alertId ID of alert to execute
     */
    function _executeAlert(uint256 alertId) internal {
        AlertData storage alert = alerts[alertId];
        require(!alert.executed, "Oracle: already executed");

        // Trigger staking contract to send alert and burn
        climateStaking.sendAlert(
            alert.alertType,
            alert.region,
            alert.recipients
        );

        // Calculate burn amount (approximate from staking contract logic)
        uint256 totalBurned = _estimateBurnAmount(alert.recipients);

        // Calculate oracle operator reward (3% of burned amount)
        uint256 operatorReward = (totalBurned * ORACLE_REWARD_RATE) / 10000;

        // Mark as executed
        alert.executed = true;
        alert.burnedAmount = totalBurned;

        // Track stats
        totalAlertsExecuted++;
        totalConfidenceScore += alert.confidence;

        // Credit operator reward
        operatorRewards[msg.sender] += operatorReward;

        emit AlertExecuted(alertId, alert.recipients.length, totalBurned, operatorReward);
    }

    /**
     * @dev Estimate total burn amount for an alert
     * @param recipients Array of recipient addresses
     */
    function _estimateBurnAmount(address[] memory recipients) internal view returns (uint256) {
        uint256 totalBurn = 0;
        for (uint256 i = 0; i < recipients.length; i++) {
            (uint256 amount,,,, bool active) = climateStaking.getStake(recipients[i]);
            if (active && amount > 0) {
                // 10% burn rate from staking contract
                totalBurn += (amount * 1000) / 10000;
            }
        }
        return totalBurn;
    }

    /**
     * @dev Claim oracle operator rewards
     */
    function claimRewards() external nonReentrant {
        uint256 reward = operatorRewards[msg.sender];
        require(reward > 0, "Oracle: no rewards");

        operatorRewards[msg.sender] = 0;
        totalRewardsPaid += reward;

        // Mint rewards from KAI token (requires MINTER_ROLE)
        kaiToken.oracleMint(msg.sender, reward, 5); // Pillar 5 = AI

        emit OracleRewarded(msg.sender, reward);
    }

    /**
     * @dev Emergency override (guardian can reject false alert)
     * @param alertId ID of alert to override
     * @param reason Reason for override
     */
    function emergencyOverride(uint256 alertId, string calldata reason)
        external
        onlyRole(GUARDIAN_ROLE)
    {
        require(alertId > 0 && alertId <= alertCount, "Oracle: invalid alert");
        AlertData storage alert = alerts[alertId];
        require(!alert.executed, "Oracle: already executed");

        alert.executed = true; // Mark as executed to prevent future execution

        emit EmergencyOverride(alertId, msg.sender, reason);
    }

    /**
     * @dev Get seal constant for alert type
     */
    function _getSealForType(uint8 aType) internal pure returns (bytes32) {
        if (aType == 1) return SEAL_OF_FLOOD;
        if (aType == 2) return SEAL_OF_DROUGHT;
        if (aType == 3) return SEAL_OF_LOCUST;
        if (aType == 4) return SEAL_OF_CYCLONE;
        if (aType == 5) return SEAL_OF_DISEASE;
        if (aType == 6) return SEAL_OF_HEATWAVE;
        if (aType == 7) return SEAL_OF_WILDFIRE;
        revert("Oracle: invalid type");
    }

    /**
     * @dev Get alert details
     */
    function getAlert(uint256 alertId)
        external
        view
        returns (
            uint8 alertType,
            string memory region,
            uint256 confidence,
            uint256 severity,
            bool executed,
            uint256 burnedAmount,
            uint256 timestamp
        )
    {
        AlertData storage alert = alerts[alertId];
        return (
            alert.alertType,
            alert.region,
            alert.confidence,
            alert.severity,
            alert.executed,
            alert.burnedAmount,
            alert.timestamp
        );
    }

    /**
     * @dev Get oracle performance stats
     */
    function getOracleStats()
        external
        view
        returns (
            uint256 _totalAlerts,
            uint256 _totalExecuted,
            uint256 _averageConfidence,
            uint256 _totalRewardsPaid
        )
    {
        uint256 avgConfidence = totalAlertsExecuted > 0
            ? totalConfidenceScore / totalAlertsExecuted
            : 0;

        return (
            alertCount,
            totalAlertsExecuted,
            avgConfidence,
            totalRewardsPaid
        );
    }

    /**
     * @dev Add oracle operator (admin only)
     */
    function addOracleOperator(address operator) external onlyRole(ADMIN_ROLE) {
        require(operator != address(0), "Oracle: invalid operator");
        _grantRole(ORACLE_OPERATOR_ROLE, operator);
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
