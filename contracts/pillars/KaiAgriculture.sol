// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "../KAIToken.sol";

/**
 * @title KaiAgriculture
 * @dev Pillar 3: Compliance & Insurance for Agriculture
 *
 * Counters Seal 3: Famine (Revelation 6:5-6)
 *
 * Features:
 * - Weather-index (parametric) insurance
 * - Compliance verification for sustainable farming
 * - Direct subsidy delivery
 * - Traceability for premium market access
 */
contract KaiAgriculture is AccessControl, ReentrancyGuard, Pausable {
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");

    KAIToken public immutable kaiToken;

    // Insurance configuration
    uint256 public basePremiumRate = 500; // 5% in basis points
    uint256 public maxCoverageMultiplier = 10; // 10x premium
    uint256 public claimCooldown = 7 days;

    // Weather thresholds for parametric triggers
    uint256 public droughtThreshold = 30; // Days without rain
    uint256 public floodThreshold = 200; // mm rainfall in 24h
    uint256 public temperatureThreshold = 40; // Celsius

    // Structs
    struct Farmer {
        address wallet;
        string region;
        uint256 farmSize; // in hectares
        uint256 registeredAt;
        bool verified;
        uint256 complianceScore; // 0-100
        uint256 totalClaims;
        uint256 totalPayouts;
    }

    struct InsurancePolicy {
        uint256 id;
        address farmer;
        uint256 premium;
        uint256 coverage;
        uint256 startTime;
        uint256 endTime;
        string[] coveredRisks; // drought, flood, pest, etc.
        bool active;
        uint256 claimsMade;
    }

    struct Claim {
        uint256 id;
        uint256 policyId;
        address farmer;
        string riskType;
        uint256 timestamp;
        uint256 oracleData;
        bool triggered;
        bool paid;
        uint256 payoutAmount;
    }

    struct ComplianceCertificate {
        uint256 id;
        address farmer;
        string certificationType; // organic, sustainable, fair-trade
        uint256 issuedAt;
        uint256 expiresAt;
        bytes32 evidenceHash;
        bool valid;
    }

    // State
    mapping(address => Farmer) public farmers;
    mapping(uint256 => InsurancePolicy) public policies;
    mapping(uint256 => Claim) public claims;
    mapping(uint256 => ComplianceCertificate) public certificates;
    mapping(address => uint256[]) public farmerPolicies;
    mapping(address => uint256[]) public farmerCertificates;

    uint256 public farmerCount;
    uint256 public policyCount;
    uint256 public claimCount;
    uint256 public certificateCount;

    uint256 public insurancePool;
    uint256 public totalPremiumsCollected;
    uint256 public totalClaimsPaid;

    // Events
    event FarmerRegistered(address indexed farmer, string region, uint256 farmSize);
    event FarmerVerified(address indexed farmer, uint256 complianceScore);
    event PolicyCreated(uint256 indexed policyId, address indexed farmer, uint256 premium, uint256 coverage);
    event ClaimSubmitted(uint256 indexed claimId, uint256 indexed policyId, string riskType);
    event ClaimTriggered(uint256 indexed claimId, uint256 oracleData);
    event ClaimPaid(uint256 indexed claimId, address indexed farmer, uint256 amount);
    event CertificateIssued(uint256 indexed certId, address indexed farmer, string certificationType);

    constructor(address _kaiToken, address admin) {
        require(_kaiToken != address(0), "Invalid token");
        require(admin != address(0), "Invalid admin");

        kaiToken = KAIToken(_kaiToken);

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ORACLE_ROLE, admin);
        _grantRole(VERIFIER_ROLE, admin);
    }

    // ============ Farmer Registration ============

    /**
     * @dev Register as a farmer
     */
    function registerFarmer(
        string calldata region,
        uint256 farmSize
    ) external whenNotPaused {
        require(bytes(region).length > 0, "Region required");
        require(farmSize > 0, "Farm size required");
        require(farmers[msg.sender].wallet == address(0), "Already registered");

        farmers[msg.sender] = Farmer({
            wallet: msg.sender,
            region: region,
            farmSize: farmSize,
            registeredAt: block.timestamp,
            verified: false,
            complianceScore: 0,
            totalClaims: 0,
            totalPayouts: 0
        });

        farmerCount++;

        emit FarmerRegistered(msg.sender, region, farmSize);
    }

    /**
     * @dev Verify farmer and set compliance score
     */
    function verifyFarmer(
        address farmerAddr,
        uint256 complianceScore
    ) external onlyRole(VERIFIER_ROLE) {
        require(complianceScore <= 100, "Invalid score");
        Farmer storage farmer = farmers[farmerAddr];
        require(farmer.wallet != address(0), "Not registered");

        farmer.verified = true;
        farmer.complianceScore = complianceScore;

        emit FarmerVerified(farmerAddr, complianceScore);
    }

    // ============ Insurance Functions ============

    /**
     * @dev Purchase insurance policy
     */
    function purchaseInsurance(
        uint256 coverageAmount,
        uint256 durationDays,
        string[] calldata risks
    ) external nonReentrant whenNotPaused returns (uint256) {
        Farmer storage farmer = farmers[msg.sender];
        require(farmer.verified, "Not verified");
        require(coverageAmount > 0, "Coverage required");
        require(durationDays >= 30 && durationDays <= 365, "Invalid duration");
        require(risks.length > 0, "Risks required");

        // Calculate premium (base rate * coverage * duration factor * risk factor)
        uint256 durationFactor = (durationDays * 100) / 365;
        uint256 riskFactor = 100 + (risks.length * 10); // More risks = higher premium
        uint256 premium = (coverageAmount * basePremiumRate * durationFactor * riskFactor) / 100000000;

        // Compliance discount (up to 20% off)
        uint256 discount = (premium * farmer.complianceScore) / 500;
        premium = premium > discount ? premium - discount : premium;

        require(premium > 0, "Premium too low");
        require(coverageAmount <= premium * maxCoverageMultiplier, "Coverage exceeds limit");

        require(kaiToken.transferFrom(msg.sender, address(this), premium), "Transfer failed");

        // 80% to insurance pool, 20% burned
        uint256 toPool = (premium * 80) / 100;
        uint256 toBurn = premium - toPool;

        insurancePool += toPool;
        totalPremiumsCollected += premium;
        kaiToken.burn(toBurn);

        policyCount++;
        uint256 policyId = policyCount;

        policies[policyId] = InsurancePolicy({
            id: policyId,
            farmer: msg.sender,
            premium: premium,
            coverage: coverageAmount,
            startTime: block.timestamp,
            endTime: block.timestamp + (durationDays * 1 days),
            coveredRisks: risks,
            active: true,
            claimsMade: 0
        });

        farmerPolicies[msg.sender].push(policyId);

        emit PolicyCreated(policyId, msg.sender, premium, coverageAmount);

        return policyId;
    }

    /**
     * @dev Submit insurance claim
     */
    function submitClaim(
        uint256 policyId,
        string calldata riskType
    ) external nonReentrant whenNotPaused returns (uint256) {
        InsurancePolicy storage policy = policies[policyId];
        require(policy.farmer == msg.sender, "Not policy holder");
        require(policy.active, "Policy inactive");
        require(block.timestamp <= policy.endTime, "Policy expired");

        // Verify risk type is covered
        bool riskCovered = false;
        for (uint256 i = 0; i < policy.coveredRisks.length; i++) {
            if (keccak256(bytes(policy.coveredRisks[i])) == keccak256(bytes(riskType))) {
                riskCovered = true;
                break;
            }
        }
        require(riskCovered, "Risk not covered");

        claimCount++;
        uint256 claimId = claimCount;

        claims[claimId] = Claim({
            id: claimId,
            policyId: policyId,
            farmer: msg.sender,
            riskType: riskType,
            timestamp: block.timestamp,
            oracleData: 0,
            triggered: false,
            paid: false,
            payoutAmount: 0
        });

        policy.claimsMade++;
        farmers[msg.sender].totalClaims++;

        emit ClaimSubmitted(claimId, policyId, riskType);

        return claimId;
    }

    /**
     * @dev Oracle triggers parametric payout
     */
    function triggerClaim(
        uint256 claimId,
        uint256 oracleData
    ) external onlyRole(ORACLE_ROLE) nonReentrant {
        Claim storage claim = claims[claimId];
        require(claim.id != 0, "Claim not found");
        require(!claim.triggered, "Already triggered");
        require(!claim.paid, "Already paid");

        claim.oracleData = oracleData;

        // Check if oracle data meets threshold
        bool shouldPayout = false;
        if (keccak256(bytes(claim.riskType)) == keccak256(bytes("drought"))) {
            shouldPayout = oracleData >= droughtThreshold;
        } else if (keccak256(bytes(claim.riskType)) == keccak256(bytes("flood"))) {
            shouldPayout = oracleData >= floodThreshold;
        } else if (keccak256(bytes(claim.riskType)) == keccak256(bytes("heat"))) {
            shouldPayout = oracleData >= temperatureThreshold;
        } else {
            // Default: payout if oracle data > 50
            shouldPayout = oracleData > 50;
        }

        if (shouldPayout) {
            claim.triggered = true;
            emit ClaimTriggered(claimId, oracleData);

            // Auto-payout
            InsurancePolicy storage policy = policies[claim.policyId];
            uint256 payoutAmount = policy.coverage;

            if (insurancePool >= payoutAmount) {
                insurancePool -= payoutAmount;
                claim.paid = true;
                claim.payoutAmount = payoutAmount;
                totalClaimsPaid += payoutAmount;

                Farmer storage farmer = farmers[claim.farmer];
                farmer.totalPayouts += payoutAmount;

                require(kaiToken.transfer(claim.farmer, payoutAmount), "Transfer failed");

                emit ClaimPaid(claimId, claim.farmer, payoutAmount);
            }
        }
    }

    // ============ Compliance Functions ============

    /**
     * @dev Issue compliance certificate
     */
    function issueCertificate(
        address farmerAddr,
        string calldata certificationType,
        uint256 validDays,
        bytes32 evidenceHash
    ) external onlyRole(VERIFIER_ROLE) returns (uint256) {
        require(farmers[farmerAddr].verified, "Farmer not verified");
        require(bytes(certificationType).length > 0, "Type required");
        require(validDays > 0, "Duration required");

        certificateCount++;
        uint256 certId = certificateCount;

        certificates[certId] = ComplianceCertificate({
            id: certId,
            farmer: farmerAddr,
            certificationType: certificationType,
            issuedAt: block.timestamp,
            expiresAt: block.timestamp + (validDays * 1 days),
            evidenceHash: evidenceHash,
            valid: true
        });

        farmerCertificates[farmerAddr].push(certId);

        emit CertificateIssued(certId, farmerAddr, certificationType);

        return certId;
    }

    /**
     * @dev Revoke certificate
     */
    function revokeCertificate(uint256 certId) external onlyRole(VERIFIER_ROLE) {
        require(certificates[certId].id != 0, "Certificate not found");
        certificates[certId].valid = false;
    }

    // ============ Pool Management ============

    /**
     * @dev Deposit to insurance pool
     */
    function depositToPool(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount required");
        require(kaiToken.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        insurancePool += amount;
    }

    /**
     * @dev Withdraw excess funds from insurance pool (admin only)
     * @param to Recipient address
     * @param amount Amount to withdraw
     * @notice SECURITY FIX: Added withdrawal function to prevent trapped funds
     * Only allows withdrawal of excess reserves above a safety threshold
     */
    function withdrawFromPool(address to, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        require(to != address(0), "Invalid recipient");
        require(amount > 0, "Zero amount");

        // Safety check: maintain minimum reserve of 20% of total premiums collected
        uint256 minimumReserve = (totalPremiumsCollected * 20) / 100;
        uint256 availableForWithdrawal = insurancePool > minimumReserve
            ? insurancePool - minimumReserve
            : 0;

        require(amount <= availableForWithdrawal, "Exceeds available withdrawal (must maintain 20% reserve)");

        insurancePool -= amount;
        require(kaiToken.transfer(to, amount), "Transfer failed");
    }

    /**
     * @dev Emergency withdrawal of any stuck tokens (admin only)
     * @param token Token address
     * @param to Recipient address
     * @param amount Amount to withdraw
     */
    function emergencyWithdraw(address token, address to, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        require(to != address(0), "Invalid recipient");
        require(amount > 0, "Zero amount");

        if (token == address(kaiToken)) {
            require(kaiToken.transfer(to, amount), "Transfer failed");
        } else {
            (bool success, bytes memory data) = token.call(
                abi.encodeWithSignature("transfer(address,uint256)", to, amount)
            );
            require(success && (data.length == 0 || abi.decode(data, (bool))), "Transfer failed");
        }
    }

    // ============ Admin Functions ============

    function setBasePremiumRate(uint256 rate) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(rate <= 2000, "Rate too high"); // Max 20%
        basePremiumRate = rate;
    }

    function setThresholds(
        uint256 drought,
        uint256 flood,
        uint256 temperature
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        droughtThreshold = drought;
        floodThreshold = flood;
        temperatureThreshold = temperature;
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // ============ View Functions ============

    function getFarmer(address farmerAddr) external view returns (Farmer memory) {
        return farmers[farmerAddr];
    }

    function getPolicy(uint256 policyId) external view returns (InsurancePolicy memory) {
        return policies[policyId];
    }

    function getClaim(uint256 claimId) external view returns (Claim memory) {
        return claims[claimId];
    }

    function getCertificate(uint256 certId) external view returns (ComplianceCertificate memory) {
        return certificates[certId];
    }

    function getFarmerPolicies(address farmerAddr) external view returns (uint256[] memory) {
        return farmerPolicies[farmerAddr];
    }

    function getFarmerCertificates(address farmerAddr) external view returns (uint256[] memory) {
        return farmerCertificates[farmerAddr];
    }
}
