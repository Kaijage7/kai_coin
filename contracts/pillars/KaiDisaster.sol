// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "../KAIToken.sol";

/**
 * @title KaiDisaster
 * @dev Pillar 6: Early Warning & Response System
 *
 * Counters Seal 6: Catastrophe (Revelation 6:12-17)
 *
 * Features:
 * - Oracle-integrated early warning system
 * - Subscription-based alert access
 * - Emergency fund management
 * - Response verification and rewards
 */
contract KaiDisaster is AccessControl, ReentrancyGuard, Pausable {
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");
    bytes32 public constant RESPONDER_ROLE = keccak256("RESPONDER_ROLE");

    KAIToken public immutable kaiToken;

    // Subscription tiers
    uint256 public basicSubscriptionFee = 10 * 10**18; // 10 KAI
    uint256 public premiumSubscriptionFee = 50 * 10**18; // 50 KAI
    uint256 public subscriptionDuration = 30 days;

    // Alert configuration
    uint256 public riskThreshold = 70; // 0-100 scale
    uint256 public alertCooldown = 1 hours;

    // Emergency fund
    uint256 public emergencyFund;
    uint256 public constant EMERGENCY_PAYOUT_CAP = 1000 * 10**18; // 1000 KAI max per incident

    // Structs
    struct Subscription {
        uint256 tier; // 1 = basic, 2 = premium
        uint256 expiresAt;
        uint256 alertsReceived;
        bool active;
    }

    struct Alert {
        uint256 id;
        string disasterType; // flood, drought, cyclone, earthquake, locust
        string region;
        uint256 riskScore; // 0-100
        uint256 timestamp;
        bool resolved;
        uint256 respondersRewarded;
    }

    struct Response {
        address responder;
        uint256 alertId;
        string actionTaken;
        bytes32 evidenceHash; // IPFS hash
        uint256 timestamp;
        bool verified;
        uint256 reward;
    }

    // State
    mapping(address => Subscription) public subscriptions;
    mapping(uint256 => Alert) public alerts;
    mapping(uint256 => Response[]) public alertResponses;
    mapping(address => uint256) public responderRewards;

    uint256 public alertCount;
    uint256 public totalAlertsIssued;
    uint256 public totalResponsesVerified;

    // Events
    event Subscribed(address indexed user, uint256 tier, uint256 expiresAt);
    event AlertIssued(uint256 indexed alertId, string disasterType, string region, uint256 riskScore);
    event AlertResolved(uint256 indexed alertId, uint256 respondersRewarded);
    event ResponseSubmitted(uint256 indexed alertId, address indexed responder, bytes32 evidenceHash);
    event ResponseVerified(uint256 indexed alertId, address indexed responder, uint256 reward);
    event EmergencyFundDeposit(address indexed from, uint256 amount);
    event EmergencyPayout(uint256 indexed alertId, address indexed to, uint256 amount);

    constructor(address _kaiToken, address admin) {
        require(_kaiToken != address(0), "Invalid token");
        require(admin != address(0), "Invalid admin");

        kaiToken = KAIToken(_kaiToken);

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ORACLE_ROLE, admin);
    }

    // ============ Subscription Functions ============

    /**
     * @dev Subscribe to disaster alerts
     */
    function subscribe(uint256 tier) external nonReentrant whenNotPaused {
        require(tier == 1 || tier == 2, "Invalid tier");

        uint256 fee = tier == 1 ? basicSubscriptionFee : premiumSubscriptionFee;
        require(kaiToken.transferFrom(msg.sender, address(this), fee), "Transfer failed");

        // 20% of fees go to emergency fund
        uint256 toFund = (fee * 20) / 100;
        emergencyFund += toFund;

        // 20% burned for deflation
        uint256 toBurn = (fee * 20) / 100;
        kaiToken.burn(toBurn);

        Subscription storage sub = subscriptions[msg.sender];
        if (sub.active && sub.expiresAt > block.timestamp) {
            // Extend existing subscription
            sub.expiresAt += subscriptionDuration;
        } else {
            // New subscription
            sub.tier = tier;
            sub.expiresAt = block.timestamp + subscriptionDuration;
            sub.active = true;
        }

        emit Subscribed(msg.sender, tier, sub.expiresAt);
    }

    /**
     * @dev Check if user has active subscription
     */
    function hasActiveSubscription(address user) public view returns (bool) {
        Subscription storage sub = subscriptions[user];
        return sub.active && sub.expiresAt > block.timestamp;
    }

    // ============ Alert Functions ============

    /**
     * @dev Issue disaster alert (oracle only)
     */
    function issueAlert(
        string calldata disasterType,
        string calldata region,
        uint256 riskScore
    ) external onlyRole(ORACLE_ROLE) whenNotPaused returns (uint256) {
        require(riskScore <= 100, "Invalid risk score");
        require(riskScore >= riskThreshold, "Below threshold");
        require(bytes(disasterType).length > 0, "Type required");
        require(bytes(region).length > 0, "Region required");

        alertCount++;
        uint256 alertId = alertCount;

        alerts[alertId] = Alert({
            id: alertId,
            disasterType: disasterType,
            region: region,
            riskScore: riskScore,
            timestamp: block.timestamp,
            resolved: false,
            respondersRewarded: 0
        });

        totalAlertsIssued++;

        emit AlertIssued(alertId, disasterType, region, riskScore);

        return alertId;
    }

    /**
     * @dev Resolve alert after disaster passes or is addressed
     */
    function resolveAlert(uint256 alertId) external onlyRole(ORACLE_ROLE) {
        Alert storage alert = alerts[alertId];
        require(alert.id != 0, "Alert not found");
        require(!alert.resolved, "Already resolved");

        alert.resolved = true;

        emit AlertResolved(alertId, alert.respondersRewarded);
    }

    // ============ Response Functions ============

    /**
     * @dev Submit disaster response for verification
     */
    function submitResponse(
        uint256 alertId,
        string calldata actionTaken,
        bytes32 evidenceHash
    ) external nonReentrant whenNotPaused {
        Alert storage alert = alerts[alertId];
        require(alert.id != 0, "Alert not found");
        require(!alert.resolved, "Alert resolved");
        require(bytes(actionTaken).length > 0, "Action required");
        require(evidenceHash != bytes32(0), "Evidence required");

        alertResponses[alertId].push(Response({
            responder: msg.sender,
            alertId: alertId,
            actionTaken: actionTaken,
            evidenceHash: evidenceHash,
            timestamp: block.timestamp,
            verified: false,
            reward: 0
        }));

        emit ResponseSubmitted(alertId, msg.sender, evidenceHash);
    }

    /**
     * @dev Verify response and issue reward
     */
    function verifyResponse(
        uint256 alertId,
        uint256 responseIndex,
        uint256 rewardAmount
    ) external onlyRole(RESPONDER_ROLE) nonReentrant {
        require(responseIndex < alertResponses[alertId].length, "Invalid index");
        require(rewardAmount <= EMERGENCY_PAYOUT_CAP, "Exceeds cap");

        Response storage response = alertResponses[alertId][responseIndex];
        require(!response.verified, "Already verified");

        response.verified = true;
        response.reward = rewardAmount;

        Alert storage alert = alerts[alertId];
        alert.respondersRewarded++;

        if (rewardAmount > 0 && emergencyFund >= rewardAmount) {
            emergencyFund -= rewardAmount;
            responderRewards[response.responder] += rewardAmount;
        }

        totalResponsesVerified++;

        emit ResponseVerified(alertId, response.responder, rewardAmount);
    }

    /**
     * @dev Claim accumulated rewards
     */
    function claimRewards() external nonReentrant {
        uint256 amount = responderRewards[msg.sender];
        require(amount > 0, "No rewards");

        responderRewards[msg.sender] = 0;
        require(kaiToken.transfer(msg.sender, amount), "Transfer failed");
    }

    // ============ Emergency Fund Functions ============

    /**
     * @dev Deposit to emergency fund
     */
    function depositToEmergencyFund(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount required");
        require(kaiToken.transferFrom(msg.sender, address(this), amount), "Transfer failed");

        emergencyFund += amount;

        emit EmergencyFundDeposit(msg.sender, amount);
    }

    /**
     * @dev Emergency payout for immediate disaster relief
     */
    function emergencyPayout(
        uint256 alertId,
        address recipient,
        uint256 amount
    ) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        require(recipient != address(0), "Invalid recipient");
        require(amount > 0 && amount <= EMERGENCY_PAYOUT_CAP, "Invalid amount");
        require(emergencyFund >= amount, "Insufficient fund");

        Alert storage alert = alerts[alertId];
        require(alert.id != 0, "Alert not found");

        emergencyFund -= amount;
        require(kaiToken.transfer(recipient, amount), "Transfer failed");

        emit EmergencyPayout(alertId, recipient, amount);
    }

    // ============ Admin Functions ============

    function setSubscriptionFees(uint256 basic, uint256 premium) external onlyRole(DEFAULT_ADMIN_ROLE) {
        basicSubscriptionFee = basic;
        premiumSubscriptionFee = premium;
    }

    function setRiskThreshold(uint256 threshold) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(threshold <= 100, "Invalid threshold");
        riskThreshold = threshold;
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function grantOracleRole(address oracle) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(ORACLE_ROLE, oracle);
    }

    function grantResponderRole(address responder) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(RESPONDER_ROLE, responder);
    }

    // ============ View Functions ============

    function getAlert(uint256 alertId) external view returns (Alert memory) {
        return alerts[alertId];
    }

    function getAlertResponses(uint256 alertId) external view returns (Response[] memory) {
        return alertResponses[alertId];
    }

    function getSubscription(address user) external view returns (Subscription memory) {
        return subscriptions[user];
    }
}
