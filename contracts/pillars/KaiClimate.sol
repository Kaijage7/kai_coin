// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "../KAIToken.sol";

/**
 * @title KaiClimate
 * @dev Pillar 7: Risk Modeling & Adaptation
 *
 * Counters Seal 7: Impending Wrath (Revelation 8:1-5)
 *
 * Features:
 * - Long-term climate risk models
 * - Adaptation project funding via DAO
 * - Carbon credit integration
 * - Sustainability metric tracking
 */
contract KaiClimate is AccessControl, ReentrancyGuard, Pausable {
    bytes32 public constant CLIMATE_SCIENTIST_ROLE = keccak256("CLIMATE_SCIENTIST_ROLE");
    bytes32 public constant PROJECT_VALIDATOR_ROLE = keccak256("PROJECT_VALIDATOR_ROLE");
    bytes32 public constant CARBON_VERIFIER_ROLE = keccak256("CARBON_VERIFIER_ROLE");

    KAIToken public immutable kaiToken;

    // Fee configuration
    uint256 public riskModelAccessFee = 25 * 10**18; // 25 KAI
    uint256 public projectProposalFee = 200 * 10**18; // 200 KAI
    uint256 public carbonCreditPrice = 10 * 10**18; // 10 KAI per credit

    // Structs
    struct ClimateRiskModel {
        uint256 id;
        string name;
        string region; // continent, country, or specific area
        string riskType; // sea-level, drought, flood, desertification, temperature
        uint256 timeHorizon; // years into future
        uint256 confidenceLevel; // 0-100
        bytes32 modelHash; // IPFS hash of model/data
        uint256 createdAt;
        uint256 lastUpdated;
        address creator;
        uint256 accessCount;
        bool active;
    }

    struct RiskScore {
        uint256 modelId;
        string region;
        uint256 score; // 0-100
        uint256 timestamp;
        uint256 projectionYear;
        string impactDescription;
    }

    struct AdaptationProject {
        uint256 id;
        address proposer;
        string name;
        string projectType; // reforestation, sea-wall, irrigation, relocation
        string region;
        uint256 fundingGoal;
        uint256 fundingRaised;
        uint256 startDate;
        uint256 endDate;
        bytes32 proposalHash;
        ProjectStatus status;
        uint256 carbonOffset; // Tons of CO2
        uint256 beneficiaries; // Number of people helped
    }

    enum ProjectStatus {
        Proposed,
        Voting,
        Approved,
        Funded,
        InProgress,
        Completed,
        Rejected,
        Cancelled
    }

    struct CarbonCredit {
        uint256 id;
        uint256 projectId;
        address owner;
        uint256 tons; // CO2 equivalent
        uint256 vintage; // Year generated
        string standard; // Verra, Gold Standard, KAI-verified
        bool retired;
        uint256 retiredAt;
    }

    struct SustainabilityMetric {
        address entity;
        uint256 carbonFootprint; // Annual tons CO2
        uint256 carbonOffset; // Credits retired
        int256 netEmissions; // Can be negative (carbon negative)
        uint256 adaptationContributions;
        uint256 lastUpdated;
    }

    // State
    mapping(uint256 => ClimateRiskModel) public riskModels;
    mapping(uint256 => RiskScore[]) public modelScores;
    mapping(uint256 => AdaptationProject) public adaptationProjects;
    mapping(uint256 => CarbonCredit) public carbonCredits;
    mapping(address => SustainabilityMetric) public sustainabilityMetrics;

    mapping(address => uint256[]) public creatorModels;
    mapping(address => uint256[]) public proposerProjects;
    mapping(address => uint256[]) public ownerCredits;

    // Voting for projects
    mapping(uint256 => mapping(address => bool)) public projectVotes;
    mapping(uint256 => uint256) public projectVoteCount;

    uint256 public modelCount;
    uint256 public projectCount;
    uint256 public creditCount;

    uint256 public adaptationFund;
    uint256 public totalCarbonOffset; // Tons

    // Events
    event RiskModelCreated(uint256 indexed modelId, string name, string region, string riskType);
    event RiskScorePublished(uint256 indexed modelId, string region, uint256 score, uint256 projectionYear);
    event ProjectProposed(uint256 indexed projectId, address indexed proposer, string name, uint256 fundingGoal);
    event ProjectVoted(uint256 indexed projectId, address indexed voter, bool support);
    event ProjectStatusChanged(uint256 indexed projectId, ProjectStatus status);
    event ProjectFunded(uint256 indexed projectId, address indexed funder, uint256 amount);
    event CarbonCreditIssued(uint256 indexed creditId, uint256 indexed projectId, address indexed owner, uint256 tons);
    event CarbonCreditRetired(uint256 indexed creditId, address indexed retirer);
    event CarbonCreditTransferred(uint256 indexed creditId, address indexed from, address indexed to);

    constructor(address _kaiToken, address admin) {
        require(_kaiToken != address(0), "Invalid token");
        require(admin != address(0), "Invalid admin");

        kaiToken = KAIToken(_kaiToken);

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(CLIMATE_SCIENTIST_ROLE, admin);
        _grantRole(PROJECT_VALIDATOR_ROLE, admin);
        _grantRole(CARBON_VERIFIER_ROLE, admin);
    }

    // ============ Risk Model Functions ============

    /**
     * @dev Create climate risk model
     */
    function createRiskModel(
        string calldata name,
        string calldata region,
        string calldata riskType,
        uint256 timeHorizon,
        uint256 confidenceLevel,
        bytes32 modelHash
    ) external onlyRole(CLIMATE_SCIENTIST_ROLE) returns (uint256) {
        require(bytes(name).length > 0, "Name required");
        require(confidenceLevel <= 100, "Invalid confidence");
        require(modelHash != bytes32(0), "Hash required");

        modelCount++;
        uint256 modelId = modelCount;

        riskModels[modelId] = ClimateRiskModel({
            id: modelId,
            name: name,
            region: region,
            riskType: riskType,
            timeHorizon: timeHorizon,
            confidenceLevel: confidenceLevel,
            modelHash: modelHash,
            createdAt: block.timestamp,
            lastUpdated: block.timestamp,
            creator: msg.sender,
            accessCount: 0,
            active: true
        });

        creatorModels[msg.sender].push(modelId);

        emit RiskModelCreated(modelId, name, region, riskType);

        return modelId;
    }

    /**
     * @dev Publish risk score from model
     */
    function publishRiskScore(
        uint256 modelId,
        string calldata region,
        uint256 score,
        uint256 projectionYear,
        string calldata impactDescription
    ) external onlyRole(CLIMATE_SCIENTIST_ROLE) {
        require(score <= 100, "Invalid score");
        ClimateRiskModel storage model = riskModels[modelId];
        require(model.active, "Model inactive");

        modelScores[modelId].push(RiskScore({
            modelId: modelId,
            region: region,
            score: score,
            timestamp: block.timestamp,
            projectionYear: projectionYear,
            impactDescription: impactDescription
        }));

        model.lastUpdated = block.timestamp;

        emit RiskScorePublished(modelId, region, score, projectionYear);
    }

    /**
     * @dev Access risk model (pay fee)
     * @notice SECURITY FIX: Added transfer return value check
     */
    function accessRiskModel(uint256 modelId) external nonReentrant whenNotPaused {
        ClimateRiskModel storage model = riskModels[modelId];
        require(model.active, "Model inactive");

        require(kaiToken.transferFrom(msg.sender, address(this), riskModelAccessFee), "Transfer failed");

        // 60% to creator, 30% to fund, 10% burned
        uint256 creatorShare = (riskModelAccessFee * 60) / 100;
        uint256 fundShare = (riskModelAccessFee * 30) / 100;
        uint256 burnShare = riskModelAccessFee - creatorShare - fundShare;

        // SECURITY FIX: Check transfer return value
        require(kaiToken.transfer(model.creator, creatorShare), "Creator transfer failed");
        adaptationFund += fundShare;
        kaiToken.burn(burnShare);

        model.accessCount++;
    }

    // ============ Adaptation Project Functions ============

    /**
     * @dev Propose adaptation project
     */
    function proposeProject(
        string calldata name,
        string calldata projectType,
        string calldata region,
        uint256 fundingGoal,
        uint256 durationDays,
        bytes32 proposalHash
    ) external nonReentrant whenNotPaused returns (uint256) {
        require(bytes(name).length > 0, "Name required");
        require(fundingGoal > 0, "Funding goal required");

        require(kaiToken.transferFrom(msg.sender, address(this), projectProposalFee), "Transfer failed");
        adaptationFund += projectProposalFee;

        projectCount++;
        uint256 projectId = projectCount;

        adaptationProjects[projectId] = AdaptationProject({
            id: projectId,
            proposer: msg.sender,
            name: name,
            projectType: projectType,
            region: region,
            fundingGoal: fundingGoal,
            fundingRaised: 0,
            startDate: 0,
            endDate: block.timestamp + (durationDays * 1 days),
            proposalHash: proposalHash,
            status: ProjectStatus.Proposed,
            carbonOffset: 0,
            beneficiaries: 0
        });

        proposerProjects[msg.sender].push(projectId);

        emit ProjectProposed(projectId, msg.sender, name, fundingGoal);

        return projectId;
    }

    /**
     * @dev Vote on project (KAI holders)
     */
    function voteOnProject(uint256 projectId, bool support) external whenNotPaused {
        AdaptationProject storage project = adaptationProjects[projectId];
        require(project.status == ProjectStatus.Voting, "Not in voting");
        require(!projectVotes[projectId][msg.sender], "Already voted");

        // Must hold minimum KAI to vote
        require(kaiToken.balanceOf(msg.sender) >= 100 * 10**18, "Insufficient balance");

        projectVotes[projectId][msg.sender] = true;

        if (support) {
            projectVoteCount[projectId]++;
        }

        emit ProjectVoted(projectId, msg.sender, support);
    }

    /**
     * @dev Move project to voting (validator only)
     */
    function startProjectVoting(uint256 projectId) external onlyRole(PROJECT_VALIDATOR_ROLE) {
        AdaptationProject storage project = adaptationProjects[projectId];
        require(project.status == ProjectStatus.Proposed, "Invalid status");

        project.status = ProjectStatus.Voting;

        emit ProjectStatusChanged(projectId, ProjectStatus.Voting);
    }

    /**
     * @dev Approve project after voting (validator only)
     */
    function approveProject(uint256 projectId, uint256 minVotes) external onlyRole(PROJECT_VALIDATOR_ROLE) {
        AdaptationProject storage project = adaptationProjects[projectId];
        require(project.status == ProjectStatus.Voting, "Not in voting");
        require(projectVoteCount[projectId] >= minVotes, "Insufficient votes");

        project.status = ProjectStatus.Approved;

        emit ProjectStatusChanged(projectId, ProjectStatus.Approved);
    }

    /**
     * @dev Fund adaptation project
     */
    function fundProject(uint256 projectId, uint256 amount) external nonReentrant whenNotPaused {
        AdaptationProject storage project = adaptationProjects[projectId];
        require(
            project.status == ProjectStatus.Approved || project.status == ProjectStatus.Funded,
            "Not approved"
        );

        require(kaiToken.transferFrom(msg.sender, address(this), amount), "Transfer failed");

        project.fundingRaised += amount;
        adaptationFund += amount;

        // Update contributor's sustainability metric
        SustainabilityMetric storage metric = sustainabilityMetrics[msg.sender];
        metric.entity = msg.sender;
        metric.adaptationContributions += amount;
        metric.lastUpdated = block.timestamp;

        if (project.fundingRaised >= project.fundingGoal) {
            project.status = ProjectStatus.Funded;
            emit ProjectStatusChanged(projectId, ProjectStatus.Funded);
        }

        emit ProjectFunded(projectId, msg.sender, amount);
    }

    /**
     * @dev Complete project and record impact
     */
    function completeProject(
        uint256 projectId,
        uint256 carbonOffset,
        uint256 beneficiaries
    ) external onlyRole(PROJECT_VALIDATOR_ROLE) {
        AdaptationProject storage project = adaptationProjects[projectId];
        require(project.status == ProjectStatus.InProgress, "Not in progress");

        project.status = ProjectStatus.Completed;
        project.carbonOffset = carbonOffset;
        project.beneficiaries = beneficiaries;

        totalCarbonOffset += carbonOffset;

        emit ProjectStatusChanged(projectId, ProjectStatus.Completed);
    }

    // ============ Carbon Credit Functions ============

    /**
     * @dev Issue carbon credits from completed project
     */
    function issueCarbonCredits(
        uint256 projectId,
        address recipient,
        uint256 tons,
        uint256 vintage,
        string calldata standard
    ) external onlyRole(CARBON_VERIFIER_ROLE) returns (uint256) {
        AdaptationProject storage project = adaptationProjects[projectId];
        require(project.status == ProjectStatus.Completed, "Project not completed");

        creditCount++;
        uint256 creditId = creditCount;

        carbonCredits[creditId] = CarbonCredit({
            id: creditId,
            projectId: projectId,
            owner: recipient,
            tons: tons,
            vintage: vintage,
            standard: standard,
            retired: false,
            retiredAt: 0
        });

        ownerCredits[recipient].push(creditId);

        emit CarbonCreditIssued(creditId, projectId, recipient, tons);

        return creditId;
    }

    /**
     * @dev Purchase carbon credits
     */
    function purchaseCarbonCredits(uint256 tons) external nonReentrant whenNotPaused returns (uint256) {
        require(tons > 0, "Tons required");

        uint256 cost = tons * carbonCreditPrice;
        require(kaiToken.transferFrom(msg.sender, address(this), cost), "Transfer failed");

        adaptationFund += cost;

        creditCount++;
        uint256 creditId = creditCount;

        carbonCredits[creditId] = CarbonCredit({
            id: creditId,
            projectId: 0, // Generic credits
            owner: msg.sender,
            tons: tons,
            vintage: block.timestamp / 365 days + 1970,
            standard: "KAI-verified",
            retired: false,
            retiredAt: 0
        });

        ownerCredits[msg.sender].push(creditId);

        emit CarbonCreditIssued(creditId, 0, msg.sender, tons);

        return creditId;
    }

    /**
     * @dev Transfer carbon credits
     */
    function transferCarbonCredit(uint256 creditId, address to) external {
        CarbonCredit storage credit = carbonCredits[creditId];
        require(credit.owner == msg.sender, "Not owner");
        require(!credit.retired, "Already retired");
        require(to != address(0), "Invalid recipient");

        credit.owner = to;
        ownerCredits[to].push(creditId);

        emit CarbonCreditTransferred(creditId, msg.sender, to);
    }

    /**
     * @dev Retire carbon credits (offset emissions)
     */
    function retireCarbonCredits(uint256 creditId) external {
        CarbonCredit storage credit = carbonCredits[creditId];
        require(credit.owner == msg.sender, "Not owner");
        require(!credit.retired, "Already retired");

        credit.retired = true;
        credit.retiredAt = block.timestamp;

        // Update sustainability metric
        SustainabilityMetric storage metric = sustainabilityMetrics[msg.sender];
        metric.entity = msg.sender;
        metric.carbonOffset += credit.tons;
        metric.netEmissions = int256(metric.carbonFootprint) - int256(metric.carbonOffset);
        metric.lastUpdated = block.timestamp;

        emit CarbonCreditRetired(creditId, msg.sender);
    }

    // ============ Sustainability Metric Functions ============

    /**
     * @dev Update entity carbon footprint (verifier only)
     */
    function updateCarbonFootprint(
        address entity,
        uint256 annualTons
    ) external onlyRole(CARBON_VERIFIER_ROLE) {
        SustainabilityMetric storage metric = sustainabilityMetrics[entity];
        metric.entity = entity;
        metric.carbonFootprint = annualTons;
        metric.netEmissions = int256(annualTons) - int256(metric.carbonOffset);
        metric.lastUpdated = block.timestamp;
    }

    // ============ Admin Functions ============

    function setFees(
        uint256 modelFee,
        uint256 proposalFee,
        uint256 creditPrice
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        riskModelAccessFee = modelFee;
        projectProposalFee = proposalFee;
        carbonCreditPrice = creditPrice;
    }

    function deactivateModel(uint256 modelId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        riskModels[modelId].active = false;
    }

    function cancelProject(uint256 projectId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        AdaptationProject storage project = adaptationProjects[projectId];
        require(project.status != ProjectStatus.Completed, "Cannot cancel completed");
        project.status = ProjectStatus.Cancelled;
        emit ProjectStatusChanged(projectId, ProjectStatus.Cancelled);
    }

    function startProject(uint256 projectId) external onlyRole(PROJECT_VALIDATOR_ROLE) {
        AdaptationProject storage project = adaptationProjects[projectId];
        require(project.status == ProjectStatus.Funded, "Not funded");
        project.status = ProjectStatus.InProgress;
        project.startDate = block.timestamp;
        emit ProjectStatusChanged(projectId, ProjectStatus.InProgress);
    }

    function depositToFund(uint256 amount) external nonReentrant {
        require(kaiToken.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        adaptationFund += amount;
    }

    /**
     * @dev Withdraw from adaptation fund (admin only)
     * @param to Recipient address
     * @param amount Amount to withdraw
     * @notice SECURITY FIX: Added withdrawal function to prevent trapped funds
     */
    function withdrawFromFund(address to, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        require(to != address(0), "Invalid recipient");
        require(amount > 0, "Zero amount");
        require(amount <= adaptationFund, "Exceeds fund balance");

        adaptationFund -= amount;
        require(kaiToken.transfer(to, amount), "Transfer failed");
    }

    /**
     * @dev Emergency withdrawal of any stuck tokens (admin only)
     * @param token Token address (use KAI token address)
     * @param to Recipient address
     * @param amount Amount to withdraw
     */
    function emergencyWithdraw(address token, address to, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        require(to != address(0), "Invalid recipient");
        require(amount > 0, "Zero amount");

        if (token == address(kaiToken)) {
            require(kaiToken.transfer(to, amount), "Transfer failed");
        } else {
            // For other ERC20 tokens that might get stuck
            (bool success, bytes memory data) = token.call(
                abi.encodeWithSignature("transfer(address,uint256)", to, amount)
            );
            require(success && (data.length == 0 || abi.decode(data, (bool))), "Transfer failed");
        }
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // ============ View Functions ============

    function getRiskModel(uint256 modelId) external view returns (ClimateRiskModel memory) {
        return riskModels[modelId];
    }

    function getModelScores(uint256 modelId) external view returns (RiskScore[] memory) {
        return modelScores[modelId];
    }

    function getProject(uint256 projectId) external view returns (AdaptationProject memory) {
        return adaptationProjects[projectId];
    }

    function getCarbonCredit(uint256 creditId) external view returns (CarbonCredit memory) {
        return carbonCredits[creditId];
    }

    function getSustainabilityMetric(address entity) external view returns (SustainabilityMetric memory) {
        return sustainabilityMetrics[entity];
    }

    function getOwnerCredits(address owner) external view returns (uint256[] memory) {
        return ownerCredits[owner];
    }
}
