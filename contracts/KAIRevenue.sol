// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./KAIToken.sol";

/**
 * @title KAI Revenue - Intelligence-as-a-Service
 * @notice Simple, Direct Revenue Model - Users Pay for Intelligence
 * @dev No complex burns. Just pure profit from valuable intelligence.
 *
 * Business Model:
 * - Users pay KAI for alerts and intelligence
 * - We collect revenue in treasury
 * - Simple subscription and pay-per-use pricing
 *
 * Revenue Streams:
 * 1. Pay-per-alert: 10-30 KAI per alert
 * 2. Subscriptions: 50-500 KAI/month
 * 3. API access: 1-20 KAI per call
 * 4. Enterprise licenses: 100,000 KAI/year
 */
contract KAIRevenue is AccessControl, ReentrancyGuard, Pausable {
    KAIToken public immutable kaiToken;
    address public treasury; // Where all revenue goes

    // Roles
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");

    // Pricing (in KAI tokens with 18 decimals)
    uint256 public constant ALERT_BASIC = 10 * 10**18; // 10 KAI
    uint256 public constant ALERT_PREMIUM = 20 * 10**18; // 20 KAI
    uint256 public constant ALERT_URGENT = 30 * 10**18; // 30 KAI

    uint256 public constant SUBSCRIPTION_BASIC = 50 * 10**18; // 50 KAI/month
    uint256 public constant SUBSCRIPTION_PREMIUM = 150 * 10**18; // 150 KAI/month
    uint256 public constant SUBSCRIPTION_ENTERPRISE = 500 * 10**18; // 500 KAI/month

    // SECURITY FIX: Fixed API pricing (no user-controlled prices)
    uint256 public constant API_PRICE_BASIC = 1 * 10**18;     // 1 KAI - Basic query
    uint256 public constant API_PRICE_STANDARD = 5 * 10**18;  // 5 KAI - Standard query
    uint256 public constant API_PRICE_PREMIUM = 10 * 10**18;  // 10 KAI - Premium query
    uint256 public constant API_PRICE_BULK = 20 * 10**18;     // 20 KAI - Bulk/historical

    // API endpoint categories
    enum APITier { Basic, Standard, Premium, Bulk }

    // Subscription types
    enum SubscriptionPlan {
        None,
        Basic,      // 10 alerts/month, drought only
        Premium,    // Unlimited alerts, all types
        Enterprise  // API access + historical data
    }

    // Subscription data
    struct Subscription {
        SubscriptionPlan plan;
        uint256 expiresAt;
        uint256 alertsUsed; // For Basic plan limits
        bool active;
    }

    // Alert types for pricing
    enum AlertType {
        Flood,
        Drought,
        Locust,
        Cyclone,
        Disease,
        Heatwave,
        Wildfire
    }

    // Mappings
    mapping(address => Subscription) public subscriptions;
    mapping(address => uint256) public totalSpent; // Track customer spending
    mapping(address => uint256) public totalAlerts; // Track alerts received

    // Revenue tracking
    uint256 public totalRevenue; // All-time revenue
    uint256 public monthlyRevenue; // Current month revenue
    uint256 public activeSubscribers;
    uint256 public totalCustomers;

    // Events
    event AlertPurchased(address indexed user, AlertType alertType, uint256 price, uint256 revenue);
    event SubscriptionPurchased(address indexed user, SubscriptionPlan plan, uint256 price, uint256 expiresAt);
    event SubscriptionRenewed(address indexed user, SubscriptionPlan plan, uint256 expiresAt);
    event RevenueCollected(uint256 amount, uint256 totalRevenue);
    event APICallPaid(address indexed user, string endpoint, uint256 price);

    constructor(
        address _kaiToken,
        address _treasury,
        address admin
    ) {
        require(_kaiToken != address(0), "Invalid token");
        require(_treasury != address(0), "Invalid treasury");
        require(admin != address(0), "Invalid admin");

        kaiToken = KAIToken(_kaiToken);
        treasury = _treasury;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
    }

    // ============================================
    // PAY-PER-ALERT (Direct Revenue)
    // ============================================

    /**
     * @dev Purchase a single alert
     * @param alertType Type of alert to receive
     * @return alertId The ID of the purchased alert
     */
    function buyAlert(AlertType alertType) external nonReentrant whenNotPaused returns (uint256) {
        uint256 price;

        // Determine pricing based on alert type and urgency
        if (alertType == AlertType.Cyclone || alertType == AlertType.Wildfire) {
            price = ALERT_URGENT; // 30 KAI - Most critical
        } else if (alertType == AlertType.Flood || alertType == AlertType.Locust) {
            price = ALERT_PREMIUM; // 20 KAI - High priority
        } else {
            price = ALERT_BASIC; // 10 KAI - Standard
        }

        // 💰 COLLECT PAYMENT → DIRECT REVENUE
        require(
            kaiToken.transferFrom(msg.sender, treasury, price),
            "Payment failed"
        );

        // Track metrics
        totalRevenue += price;
        monthlyRevenue += price;
        totalSpent[msg.sender] += price;
        totalAlerts[msg.sender] += 1;

        if (totalAlerts[msg.sender] == 1) {
            totalCustomers++;
        }

        uint256 alertId = uint256(keccak256(abi.encodePacked(
            msg.sender,
            block.timestamp,
            alertType
        )));

        emit AlertPurchased(msg.sender, alertType, price, totalRevenue);
        emit RevenueCollected(price, totalRevenue);

        return alertId;
    }

    // ============================================
    // SUBSCRIPTIONS (Recurring Revenue)
    // ============================================

    /**
     * @dev Subscribe to monthly intelligence service
     * @param plan Subscription plan (Basic, Premium, Enterprise)
     */
    function subscribe(SubscriptionPlan plan) external nonReentrant whenNotPaused {
        require(plan != SubscriptionPlan.None, "Invalid plan");
        require(!subscriptions[msg.sender].active, "Already subscribed");

        uint256 price;
        if (plan == SubscriptionPlan.Basic) {
            price = SUBSCRIPTION_BASIC;
        } else if (plan == SubscriptionPlan.Premium) {
            price = SUBSCRIPTION_PREMIUM;
        } else {
            price = SUBSCRIPTION_ENTERPRISE;
        }

        // 💰 COLLECT PAYMENT → MONTHLY RECURRING REVENUE
        require(
            kaiToken.transferFrom(msg.sender, treasury, price),
            "Payment failed"
        );

        uint256 expiresAt = block.timestamp + 30 days;

        subscriptions[msg.sender] = Subscription({
            plan: plan,
            expiresAt: expiresAt,
            alertsUsed: 0,
            active: true
        });

        // Track metrics
        totalRevenue += price;
        monthlyRevenue += price;
        totalSpent[msg.sender] += price;
        activeSubscribers++;

        if (totalAlerts[msg.sender] == 0) {
            totalCustomers++;
        }

        emit SubscriptionPurchased(msg.sender, plan, price, expiresAt);
        emit RevenueCollected(price, totalRevenue);
    }

    /**
     * @dev Renew expired subscription
     * @notice SECURITY FIX: Counter logic fixed - check expiry BEFORE updating
     */
    function renewSubscription() external nonReentrant whenNotPaused {
        Subscription storage sub = subscriptions[msg.sender];
        require(sub.plan != SubscriptionPlan.None, "No subscription");

        uint256 price;
        if (sub.plan == SubscriptionPlan.Basic) {
            price = SUBSCRIPTION_BASIC;
        } else if (sub.plan == SubscriptionPlan.Premium) {
            price = SUBSCRIPTION_PREMIUM;
        } else {
            price = SUBSCRIPTION_ENTERPRISE;
        }

        // SECURITY FIX: Check if subscription was expired BEFORE updating expiresAt
        bool wasExpired = block.timestamp > sub.expiresAt;

        // 💰 COLLECT RENEWAL PAYMENT
        require(
            kaiToken.transferFrom(msg.sender, treasury, price),
            "Payment failed"
        );

        // Now update the subscription
        sub.expiresAt = block.timestamp + 30 days;
        sub.alertsUsed = 0;
        sub.active = true;

        // SECURITY FIX: Correctly increment if was expired (checked BEFORE update)
        if (wasExpired) {
            activeSubscribers++; // Was expired, now active again
        }

        totalRevenue += price;
        monthlyRevenue += price;
        totalSpent[msg.sender] += price;

        emit SubscriptionRenewed(msg.sender, sub.plan, sub.expiresAt);
        emit RevenueCollected(price, totalRevenue);
    }

    /**
     * @dev Get alert as subscriber (free if within plan limits)
     */
    function getSubscriberAlert(AlertType alertType) external nonReentrant whenNotPaused returns (uint256) {
        Subscription storage sub = subscriptions[msg.sender];
        require(sub.active, "No active subscription");
        require(block.timestamp < sub.expiresAt, "Subscription expired");

        // Check plan limits
        if (sub.plan == SubscriptionPlan.Basic) {
            require(sub.alertsUsed < 10, "Monthly limit reached");
            require(alertType == AlertType.Drought, "Plan only covers drought");
        }

        sub.alertsUsed++;
        totalAlerts[msg.sender]++;

        uint256 alertId = uint256(keccak256(abi.encodePacked(
            msg.sender,
            block.timestamp,
            alertType
        )));

        emit AlertPurchased(msg.sender, alertType, 0, totalRevenue);

        return alertId;
    }

    // ============================================
    // API ACCESS (Pay-Per-Call Revenue)
    // ============================================

    /**
     * @dev Pay for API access with FIXED pricing tiers
     * @param endpoint API endpoint being called
     * @param tier The pricing tier for this API call
     * @notice SECURITY FIX: Removed user-controlled price parameter
     * Previous version allowed users to set price=0, breaking the revenue model
     */
    function payForAPICall(string memory endpoint, APITier tier) external nonReentrant whenNotPaused {
        // SECURITY FIX: Use fixed pricing based on tier, not user input
        uint256 price;
        if (tier == APITier.Basic) {
            price = API_PRICE_BASIC;
        } else if (tier == APITier.Standard) {
            price = API_PRICE_STANDARD;
        } else if (tier == APITier.Premium) {
            price = API_PRICE_PREMIUM;
        } else {
            price = API_PRICE_BULK;
        }

        // Enterprise subscribers get free API access
        Subscription memory sub = subscriptions[msg.sender];
        if (sub.plan == SubscriptionPlan.Enterprise &&
            sub.active &&
            block.timestamp < sub.expiresAt) {
            // Free for enterprise - just track the call
            emit APICallPaid(msg.sender, endpoint, 0);
            return;
        }

        // 💰 COLLECT API PAYMENT at fixed price
        require(
            kaiToken.transferFrom(msg.sender, treasury, price),
            "Payment failed"
        );

        totalRevenue += price;
        monthlyRevenue += price;
        totalSpent[msg.sender] += price;

        emit APICallPaid(msg.sender, endpoint, price);
        emit RevenueCollected(price, totalRevenue);
    }

    /**
     * @dev Get API pricing for a tier
     */
    function getAPIPrice(APITier tier) external pure returns (uint256) {
        if (tier == APITier.Basic) return API_PRICE_BASIC;
        if (tier == APITier.Standard) return API_PRICE_STANDARD;
        if (tier == APITier.Premium) return API_PRICE_PREMIUM;
        return API_PRICE_BULK;
    }

    // ============================================
    // VIEW FUNCTIONS
    // ============================================

    /**
     * @dev Check if user has active subscription
     */
    function hasActiveSubscription(address user) external view returns (bool) {
        Subscription memory sub = subscriptions[user];
        return sub.active && block.timestamp < sub.expiresAt;
    }

    /**
     * @dev Get subscription details
     */
    function getSubscription(address user) external view returns (
        SubscriptionPlan plan,
        uint256 expiresAt,
        uint256 alertsUsed,
        bool active,
        bool expired
    ) {
        Subscription memory sub = subscriptions[user];
        return (
            sub.plan,
            sub.expiresAt,
            sub.alertsUsed,
            sub.active,
            block.timestamp >= sub.expiresAt
        );
    }

    /**
     * @dev Get customer stats
     */
    function getCustomerStats(address user) external view returns (
        uint256 spent,
        uint256 alerts,
        SubscriptionPlan plan,
        bool hasSubscription
    ) {
        return (
            totalSpent[user],
            totalAlerts[user],
            subscriptions[user].plan,
            subscriptions[user].active && block.timestamp < subscriptions[user].expiresAt
        );
    }

    /**
     * @dev Get platform revenue stats
     */
    function getRevenueStats() external view returns (
        uint256 _totalRevenue,
        uint256 _monthlyRevenue,
        uint256 _activeSubscribers,
        uint256 _totalCustomers
    ) {
        return (totalRevenue, monthlyRevenue, activeSubscribers, totalCustomers);
    }

    // ============================================
    // ADMIN FUNCTIONS
    // ============================================

    /**
     * @dev Update treasury address
     */
    function updateTreasury(address newTreasury) external onlyRole(ADMIN_ROLE) {
        require(newTreasury != address(0), "Invalid address");
        treasury = newTreasury;
    }

    /**
     * @dev Reset monthly revenue counter (for tracking)
     */
    function resetMonthlyRevenue() external onlyRole(ADMIN_ROLE) {
        monthlyRevenue = 0;
    }

    /**
     * @dev Pause contract
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
