// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "../core/KaiToken.sol";

/**
 * @title KaiAI
 * @dev Pillar 5: AI Compute & Model Access
 *
 * Counters Seal 5: Injustice (Revelation 6:9-11)
 *
 * Features:
 * - Decentralized compute marketplace
 * - Data contribution rewards
 * - Model access fees fund local AI development
 * - African data sovereignty
 */
contract KaiAI is AccessControl, ReentrancyGuard, Pausable {
    bytes32 public constant COMPUTE_PROVIDER_ROLE = keccak256("COMPUTE_PROVIDER_ROLE");
    bytes32 public constant MODEL_PUBLISHER_ROLE = keccak256("MODEL_PUBLISHER_ROLE");
    bytes32 public constant DATA_VALIDATOR_ROLE = keccak256("DATA_VALIDATOR_ROLE");

    KaiToken public immutable kaiToken;

    // Fee configuration
    uint256 public baseInferenceFee = 1 * 10**18; // 1 KAI per inference
    uint256 public dataContributionReward = 5 * 10**18; // 5 KAI per validated dataset
    uint256 public modelPublishFee = 500 * 10**18; // 500 KAI to publish model

    // Structs
    struct AIModel {
        uint256 id;
        address publisher;
        string name;
        string modelType; // classification, prediction, risk-scoring, nlp
        string domain; // climate, disaster, health, agriculture
        bytes32 modelHash; // IPFS hash of model weights
        uint256 feePerInference;
        uint256 totalInferences;
        uint256 totalRevenue;
        uint256 publishedAt;
        bool active;
        uint256 rating; // 0-100 based on accuracy
    }

    struct ComputeProvider {
        address provider;
        string name;
        uint256 capacity; // TFLOPS available
        uint256 pricePerUnit; // KAI per TFLOP-hour
        uint256 totalJobsCompleted;
        uint256 totalEarnings;
        uint256 reputation; // 0-100
        bool active;
    }

    struct DataContribution {
        uint256 id;
        address contributor;
        string dataType; // weather, health, agricultural, satellite
        string region;
        bytes32 dataHash;
        uint256 size; // in MB
        uint256 timestamp;
        bool validated;
        uint256 reward;
    }

    struct InferenceRequest {
        uint256 id;
        address requester;
        uint256 modelId;
        bytes32 inputHash;
        bytes32 outputHash;
        uint256 fee;
        uint256 timestamp;
        bool completed;
        address computeProvider;
    }

    struct ComputeJob {
        uint256 id;
        address requester;
        address provider;
        string jobType; // training, inference-batch, data-processing
        uint256 estimatedUnits;
        uint256 actualUnits;
        uint256 price;
        uint256 startTime;
        uint256 endTime;
        bool completed;
        bool disputed;
    }

    // State
    mapping(uint256 => AIModel) public models;
    mapping(address => ComputeProvider) public computeProviders;
    mapping(uint256 => DataContribution) public dataContributions;
    mapping(uint256 => InferenceRequest) public inferenceRequests;
    mapping(uint256 => ComputeJob) public computeJobs;

    mapping(address => uint256[]) public publisherModels;
    mapping(address => uint256[]) public contributorData;
    mapping(address => uint256[]) public requesterJobs;

    uint256 public modelCount;
    uint256 public dataContributionCount;
    uint256 public inferenceCount;
    uint256 public computeJobCount;
    uint256 public activeProviderCount;

    uint256 public aiDevelopmentFund; // For African AI research
    uint256 public totalDataContributed; // MB

    // Events
    event ModelPublished(uint256 indexed modelId, address indexed publisher, string name, string domain);
    event ModelUpdated(uint256 indexed modelId, bytes32 newHash);
    event InferenceCompleted(uint256 indexed requestId, uint256 indexed modelId, address indexed requester);
    event ComputeProviderRegistered(address indexed provider, string name, uint256 capacity);
    event ComputeJobCreated(uint256 indexed jobId, address indexed requester, address indexed provider);
    event ComputeJobCompleted(uint256 indexed jobId, uint256 actualUnits);
    event DataContributed(uint256 indexed contributionId, address indexed contributor, string dataType);
    event DataValidated(uint256 indexed contributionId, uint256 reward);

    constructor(address _kaiToken, address admin) {
        require(_kaiToken != address(0), "Invalid token");
        require(admin != address(0), "Invalid admin");

        kaiToken = KaiToken(_kaiToken);

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MODEL_PUBLISHER_ROLE, admin);
        _grantRole(DATA_VALIDATOR_ROLE, admin);
    }

    // ============ Model Functions ============

    /**
     * @dev Publish AI model
     */
    function publishModel(
        string calldata name,
        string calldata modelType,
        string calldata domain,
        bytes32 modelHash,
        uint256 feePerInference
    ) external nonReentrant whenNotPaused returns (uint256) {
        require(bytes(name).length > 0, "Name required");
        require(modelHash != bytes32(0), "Hash required");
        require(feePerInference >= baseInferenceFee, "Fee too low");

        require(kaiToken.transferFrom(msg.sender, address(this), modelPublishFee), "Transfer failed");

        // 50% to AI fund, 50% burned
        aiDevelopmentFund += modelPublishFee / 2;
        kaiToken.burn(modelPublishFee / 2);

        modelCount++;
        uint256 modelId = modelCount;

        models[modelId] = AIModel({
            id: modelId,
            publisher: msg.sender,
            name: name,
            modelType: modelType,
            domain: domain,
            modelHash: modelHash,
            feePerInference: feePerInference,
            totalInferences: 0,
            totalRevenue: 0,
            publishedAt: block.timestamp,
            active: true,
            rating: 50 // Start neutral
        });

        publisherModels[msg.sender].push(modelId);

        emit ModelPublished(modelId, msg.sender, name, domain);

        return modelId;
    }

    /**
     * @dev Request inference
     */
    function requestInference(
        uint256 modelId,
        bytes32 inputHash
    ) external nonReentrant whenNotPaused returns (uint256) {
        AIModel storage model = models[modelId];
        require(model.active, "Model inactive");

        require(kaiToken.transferFrom(msg.sender, address(this), model.feePerInference), "Transfer failed");

        inferenceCount++;
        uint256 requestId = inferenceCount;

        inferenceRequests[requestId] = InferenceRequest({
            id: requestId,
            requester: msg.sender,
            modelId: modelId,
            inputHash: inputHash,
            outputHash: bytes32(0),
            fee: model.feePerInference,
            timestamp: block.timestamp,
            completed: false,
            computeProvider: address(0)
        });

        return requestId;
    }

    /**
     * @dev Complete inference (compute provider)
     */
    function completeInference(
        uint256 requestId,
        bytes32 outputHash
    ) external onlyRole(COMPUTE_PROVIDER_ROLE) nonReentrant {
        InferenceRequest storage request = inferenceRequests[requestId];
        require(request.id != 0, "Not found");
        require(!request.completed, "Already completed");

        request.outputHash = outputHash;
        request.completed = true;
        request.computeProvider = msg.sender;

        AIModel storage model = models[request.modelId];
        model.totalInferences++;

        // Fee distribution: 70% to publisher, 20% to provider, 10% to fund
        uint256 publisherShare = (request.fee * 70) / 100;
        uint256 providerShare = (request.fee * 20) / 100;
        uint256 fundShare = request.fee - publisherShare - providerShare;

        model.totalRevenue += publisherShare;
        aiDevelopmentFund += fundShare;

        kaiToken.transfer(model.publisher, publisherShare);
        kaiToken.transfer(msg.sender, providerShare);

        ComputeProvider storage provider = computeProviders[msg.sender];
        provider.totalJobsCompleted++;
        provider.totalEarnings += providerShare;

        emit InferenceCompleted(requestId, request.modelId, request.requester);
    }

    // ============ Compute Provider Functions ============

    /**
     * @dev Register as compute provider
     */
    function registerComputeProvider(
        string calldata name,
        uint256 capacity,
        uint256 pricePerUnit
    ) external whenNotPaused {
        require(bytes(name).length > 0, "Name required");
        require(capacity > 0, "Capacity required");
        require(computeProviders[msg.sender].provider == address(0), "Already registered");

        computeProviders[msg.sender] = ComputeProvider({
            provider: msg.sender,
            name: name,
            capacity: capacity,
            pricePerUnit: pricePerUnit,
            totalJobsCompleted: 0,
            totalEarnings: 0,
            reputation: 50,
            active: true
        });

        activeProviderCount++;
        _grantRole(COMPUTE_PROVIDER_ROLE, msg.sender);

        emit ComputeProviderRegistered(msg.sender, name, capacity);
    }

    /**
     * @dev Create compute job
     */
    function createComputeJob(
        address provider,
        string calldata jobType,
        uint256 estimatedUnits
    ) external nonReentrant whenNotPaused returns (uint256) {
        ComputeProvider storage cp = computeProviders[provider];
        require(cp.active, "Provider inactive");

        uint256 estimatedPrice = estimatedUnits * cp.pricePerUnit;
        require(kaiToken.transferFrom(msg.sender, address(this), estimatedPrice), "Transfer failed");

        computeJobCount++;
        uint256 jobId = computeJobCount;

        computeJobs[jobId] = ComputeJob({
            id: jobId,
            requester: msg.sender,
            provider: provider,
            jobType: jobType,
            estimatedUnits: estimatedUnits,
            actualUnits: 0,
            price: estimatedPrice,
            startTime: block.timestamp,
            endTime: 0,
            completed: false,
            disputed: false
        });

        requesterJobs[msg.sender].push(jobId);

        emit ComputeJobCreated(jobId, msg.sender, provider);

        return jobId;
    }

    /**
     * @dev Complete compute job
     */
    function completeComputeJob(
        uint256 jobId,
        uint256 actualUnits
    ) external nonReentrant {
        ComputeJob storage job = computeJobs[jobId];
        require(job.provider == msg.sender, "Not provider");
        require(!job.completed, "Already completed");

        job.actualUnits = actualUnits;
        job.endTime = block.timestamp;
        job.completed = true;

        ComputeProvider storage provider = computeProviders[msg.sender];
        uint256 actualPrice = actualUnits * provider.pricePerUnit;

        // Refund if actual < estimated
        if (actualPrice < job.price) {
            uint256 refund = job.price - actualPrice;
            kaiToken.transfer(job.requester, refund);
        }

        // Pay provider (90%), fund (10%)
        uint256 payment = actualPrice > job.price ? job.price : actualPrice;
        uint256 providerPayment = (payment * 90) / 100;
        uint256 fundPayment = payment - providerPayment;

        kaiToken.transfer(msg.sender, providerPayment);
        aiDevelopmentFund += fundPayment;

        provider.totalJobsCompleted++;
        provider.totalEarnings += providerPayment;

        emit ComputeJobCompleted(jobId, actualUnits);
    }

    // ============ Data Contribution Functions ============

    /**
     * @dev Contribute data
     */
    function contributeData(
        string calldata dataType,
        string calldata region,
        bytes32 dataHash,
        uint256 size
    ) external whenNotPaused returns (uint256) {
        require(bytes(dataType).length > 0, "Type required");
        require(dataHash != bytes32(0), "Hash required");
        require(size > 0, "Size required");

        dataContributionCount++;
        uint256 contributionId = dataContributionCount;

        dataContributions[contributionId] = DataContribution({
            id: contributionId,
            contributor: msg.sender,
            dataType: dataType,
            region: region,
            dataHash: dataHash,
            size: size,
            timestamp: block.timestamp,
            validated: false,
            reward: 0
        });

        contributorData[msg.sender].push(contributionId);

        emit DataContributed(contributionId, msg.sender, dataType);

        return contributionId;
    }

    /**
     * @dev Validate data contribution and reward
     */
    function validateDataContribution(
        uint256 contributionId,
        uint256 qualityScore
    ) external onlyRole(DATA_VALIDATOR_ROLE) nonReentrant {
        require(qualityScore <= 100, "Invalid score");

        DataContribution storage contribution = dataContributions[contributionId];
        require(contribution.id != 0, "Not found");
        require(!contribution.validated, "Already validated");

        contribution.validated = true;

        // Reward based on size and quality
        uint256 reward = (dataContributionReward * qualityScore * contribution.size) / (100 * 100);
        contribution.reward = reward;

        if (reward > 0 && aiDevelopmentFund >= reward) {
            aiDevelopmentFund -= reward;
            kaiToken.transfer(contribution.contributor, reward);
        }

        totalDataContributed += contribution.size;

        emit DataValidated(contributionId, reward);
    }

    // ============ Admin Functions ============

    function setFees(
        uint256 inference,
        uint256 dataReward,
        uint256 publishFee
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        baseInferenceFee = inference;
        dataContributionReward = dataReward;
        modelPublishFee = publishFee;
    }

    function updateModelRating(uint256 modelId, uint256 rating) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(rating <= 100, "Invalid rating");
        models[modelId].rating = rating;
    }

    function deactivateModel(uint256 modelId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        models[modelId].active = false;
    }

    function updateProviderReputation(address provider, uint256 reputation) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(reputation <= 100, "Invalid reputation");
        computeProviders[provider].reputation = reputation;
    }

    function depositToFund(uint256 amount) external nonReentrant {
        require(kaiToken.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        aiDevelopmentFund += amount;
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // ============ View Functions ============

    function getModel(uint256 modelId) external view returns (AIModel memory) {
        return models[modelId];
    }

    function getComputeProvider(address provider) external view returns (ComputeProvider memory) {
        return computeProviders[provider];
    }

    function getDataContribution(uint256 id) external view returns (DataContribution memory) {
        return dataContributions[id];
    }

    function getInferenceRequest(uint256 id) external view returns (InferenceRequest memory) {
        return inferenceRequests[id];
    }

    function getComputeJob(uint256 id) external view returns (ComputeJob memory) {
        return computeJobs[id];
    }

    function getPublisherModels(address publisher) external view returns (uint256[] memory) {
        return publisherModels[publisher];
    }
}
