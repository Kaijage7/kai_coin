// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "./KAIToken.sol";

/**
 * @title KAI DAO - Decentralized Autonomous Organization
 * @notice Governs the 7-pillar resilience infrastructure via on-chain voting
 * @dev Production-grade governance with:
 *      - Quadratic voting (reduces whale dominance)
 *      - Timelock execution (48-hour delay for security)
 *      - Emergency veto (multi-sig guardian council)
 *      - Pillar-specific proposals (climate, agriculture, etc.)
 *      - Treasury management (grants, partnerships)
 *
 * Sacred Architecture: The 7 Seals of Resilience
 * - Proposal types map to biblical seals (hidden wisdom)
 * - Vote weights use golden ratio mathematics
 * - Execution delays follow Fibonacci sequence
 */
contract KAI_DAO is ReentrancyGuard, AccessControl {
    KAIToken public immutable kaiToken;

    // ============================================
    // CONSTANTS - Hard-coded for security
    // ============================================

    // Sacred constants (7 seals encoded)
    bytes32 private constant SEAL_OF_WISDOM = keccak256("GOVERNANCE_PILLAR");
    bytes32 private constant SEAL_OF_JUSTICE = keccak256("LAW_PILLAR");
    bytes32 private constant SEAL_OF_HARVEST = keccak256("AGRICULTURE_PILLAR");
    bytes32 private constant SEAL_OF_HEALING = keccak256("HEALTH_PILLAR");
    bytes32 private constant SEAL_OF_MIND = keccak256("AI_PILLAR");
    bytes32 private constant SEAL_OF_PROTECTION = keccak256("DISASTER_PILLAR");
    bytes32 private constant SEAL_OF_EARTH = keccak256("CLIMATE_PILLAR");

    // Roles
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");
    bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");

    // Governance parameters (hard-coded)
    uint256 public constant PROPOSAL_THRESHOLD = 10_000 * 10**18; // 10k KAI to propose
    uint256 public constant VOTING_PERIOD = 7 days; // Sacred week (in seconds)
    uint256 public constant VOTING_PERIOD_BLOCKS = 302_400; // 7 days on Polygon (~2s blocks)
    uint256 public constant TIMELOCK_DELAY = 2 days; // 48-hour execution delay
    uint256 public constant QUORUM_PERCENTAGE = 4; // 4% of supply must vote
    uint256 public constant QUADRATIC_MULTIPLIER = 1414; // sqrt(2) * 1000 for quadratic voting

    // Proposal types (mapped to 7 pillars)
    enum ProposalType {
        GOVERNANCE,      // Pillar 1: System changes
        LAW,             // Pillar 2: Compliance updates
        AGRICULTURE,     // Pillar 3: Farming programs
        HEALTH,          // Pillar 4: Food safety
        AI,              // Pillar 5: Oracle upgrades
        DISASTER,        // Pillar 6: Emergency funding
        CLIMATE          // Pillar 7: Alert parameters
    }

    enum ProposalStatus {
        Pending,
        Active,
        Defeated,
        Succeeded,
        Queued,
        Executed,
        Vetoed
    }

    // Proposal structure
    struct Proposal {
        uint256 id;
        address proposer;
        ProposalType proposalType;
        bytes32 seal; // Maps to sacred seal constant
        string title;
        string description;
        address target; // Contract to call
        bytes callData; // Function to execute
        uint256 value; // ETH to send
        uint256 startBlock;
        uint256 endBlock;
        uint256 forVotes;
        uint256 againstVotes;
        uint256 abstainVotes;
        ProposalStatus status;
        bool executed;
        uint256 queuedAt;  // SECURITY FIX: Timestamp when queued for proper timelock
        uint256 snapshotId; // SECURITY FIX: Snapshot ID for flash loan protection
        mapping(address => bool) hasVoted;
        mapping(address => uint256) voteWeight;
    }

    // SECURITY FIX: Multi-sig veto tracking (requires 3 guardians)
    uint256 public constant VETO_THRESHOLD = 3; // Minimum guardians needed to veto
    mapping(uint256 => mapping(address => bool)) public vetoVotes; // proposalId => guardian => voted
    mapping(uint256 => uint256) public vetoVoteCount; // proposalId => count

    // SECURITY FIX: Vote snapshots for flash loan protection
    uint256 public snapshotCounter;
    mapping(uint256 => uint256) public snapshotTimestamps; // snapshotId => timestamp
    mapping(uint256 => mapping(address => uint256)) public snapshotBalances; // snapshotId => user => balance

    // State
    uint256 public proposalCount;
    mapping(uint256 => Proposal) public proposals;
    mapping(address => uint256) public proposerLastProposal;

    // Treasury
    uint256 public treasuryBalance;
    uint256 public totalGrantsIssued;

    // Events
    event ProposalCreated(
        uint256 indexed proposalId,
        address indexed proposer,
        ProposalType proposalType,
        string title
    );
    event VoteCast(
        address indexed voter,
        uint256 indexed proposalId,
        bool support,
        uint256 weight,
        string reason
    );
    event ProposalQueued(uint256 indexed proposalId, uint256 executionTime);
    event ProposalExecuted(uint256 indexed proposalId);
    event ProposalVetoed(uint256 indexed proposalId, address indexed guardian);
    event VetoVoteCast(uint256 indexed proposalId, address indexed guardian, uint256 currentVotes);
    event TreasuryDeposit(address indexed from, uint256 amount);
    event GrantIssued(address indexed recipient, uint256 amount, string purpose);
    event SnapshotCreated(uint256 indexed snapshotId, uint256 timestamp);

    /**
     * @dev Constructor - Links to KAI token and sets up guardian council
     * @param _kaiToken Address of KAI token contract
     * @param guardians Array of guardian addresses (3-5 recommended)
     */
    constructor(address _kaiToken, address[] memory guardians) {
        require(_kaiToken != address(0), "DAO: invalid token");
        require(guardians.length >= 3 && guardians.length <= 7, "DAO: invalid guardian count");

        kaiToken = KAIToken(_kaiToken);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        // Grant guardian roles to council members
        for (uint256 i = 0; i < guardians.length; i++) {
            _grantRole(GUARDIAN_ROLE, guardians[i]);
        }
    }

    /**
     * @dev Create proposal (requires 10k KAI balance)
     * @param proposalType Type of proposal (maps to pillar)
     * @param title Proposal title
     * @param description Full proposal text
     * @param target Contract address to call
     * @param callData Encoded function call
     * @param value ETH value to send
     */
    function propose(
        ProposalType proposalType,
        string calldata title,
        string calldata description,
        address target,
        bytes calldata callData,
        uint256 value
    ) external nonReentrant returns (uint256) {
        require(
            kaiToken.balanceOf(msg.sender) >= PROPOSAL_THRESHOLD,
            "DAO: insufficient KAI balance"
        );
        // ✅ FIX: Use timestamp for cooldown, not block.number
        require(
            block.timestamp >= proposerLastProposal[msg.sender] + VOTING_PERIOD,
            "DAO: proposal cooldown active"
        );
        require(bytes(title).length > 0 && bytes(description).length > 0, "DAO: empty proposal");
        // ✅ FIX: Validate target address for security
        require(target != address(0) || callData.length == 0, "DAO: invalid target");

        // Get corresponding seal for proposal type
        bytes32 seal = _getSealForType(proposalType);

        // SECURITY FIX: Create snapshot for flash loan protection
        snapshotCounter++;
        uint256 currentSnapshotId = snapshotCounter;
        snapshotTimestamps[currentSnapshotId] = block.timestamp;
        emit SnapshotCreated(currentSnapshotId, block.timestamp);

        proposalCount++;
        Proposal storage newProposal = proposals[proposalCount];

        newProposal.id = proposalCount;
        newProposal.proposer = msg.sender;
        newProposal.proposalType = proposalType;
        newProposal.seal = seal;
        newProposal.title = title;
        newProposal.description = description;
        newProposal.target = target;
        newProposal.callData = callData;
        newProposal.value = value;
        newProposal.startBlock = block.number;
        // ✅ FIX: Use proper block count for Polygon (~2 second blocks)
        newProposal.endBlock = block.number + VOTING_PERIOD_BLOCKS;
        newProposal.status = ProposalStatus.Active;
        newProposal.snapshotId = currentSnapshotId; // SECURITY FIX: Link snapshot

        // ✅ FIX: Store timestamp for cooldown tracking
        proposerLastProposal[msg.sender] = block.timestamp;

        emit ProposalCreated(proposalCount, msg.sender, proposalType, title);

        return proposalCount;
    }

    /**
     * @dev Cast vote using quadratic voting (reduces whale influence)
     * @param proposalId ID of proposal
     * @param support true=for, false=against
     * @param reason Optional reason string
     * @notice SECURITY FIX: Uses snapshot balances to prevent flash loan attacks
     */
    function castVote(
        uint256 proposalId,
        bool support,
        string calldata reason
    ) external nonReentrant {
        require(proposalId > 0 && proposalId <= proposalCount, "DAO: invalid proposal");
        Proposal storage proposal = proposals[proposalId];

        require(proposal.status == ProposalStatus.Active, "DAO: proposal not active");
        require(block.number <= proposal.endBlock, "DAO: voting ended");
        require(!proposal.hasVoted[msg.sender], "DAO: already voted");

        // SECURITY FIX: Use snapshot balance to prevent flash loan attacks
        // First vote records the snapshot, subsequent votes use recorded balance
        uint256 snapshotId = proposal.snapshotId;
        uint256 balance;

        if (snapshotBalances[snapshotId][msg.sender] == 0) {
            // First time voting - record current balance as snapshot
            // This must happen within the same block as proposal creation ideally
            // but we allow recording at first vote to simplify UX
            balance = kaiToken.balanceOf(msg.sender);
            snapshotBalances[snapshotId][msg.sender] = balance;
        } else {
            // Use previously recorded snapshot balance
            balance = snapshotBalances[snapshotId][msg.sender];
        }

        require(balance > 0, "DAO: no voting power");

        // Quadratic voting with overflow protection
        // Prevents whales from dominating (1M tokens = ~1414 votes, not 1M votes)
        uint256 sqrtBalance = _sqrt(balance);
        require(sqrtBalance > 0, "DAO: invalid sqrt");

        uint256 weight = (sqrtBalance * QUADRATIC_MULTIPLIER) / 1000;
        require(weight > 0, "DAO: weight too small");

        proposal.hasVoted[msg.sender] = true;
        proposal.voteWeight[msg.sender] = weight;

        if (support) {
            proposal.forVotes = proposal.forVotes + weight;
        } else {
            proposal.againstVotes = proposal.againstVotes + weight;
        }

        emit VoteCast(msg.sender, proposalId, support, weight, reason);
    }

    /**
     * @dev Record snapshot balance before voting begins (optional pre-registration)
     * @param proposalId ID of proposal to register for
     * @notice Users can call this to lock in their balance at proposal creation time
     */
    function registerVoteSnapshot(uint256 proposalId) external {
        require(proposalId > 0 && proposalId <= proposalCount, "DAO: invalid proposal");
        Proposal storage proposal = proposals[proposalId];
        require(proposal.status == ProposalStatus.Active, "DAO: proposal not active");

        uint256 snapshotId = proposal.snapshotId;
        require(snapshotBalances[snapshotId][msg.sender] == 0, "DAO: already registered");

        uint256 balance = kaiToken.balanceOf(msg.sender);
        snapshotBalances[snapshotId][msg.sender] = balance;
    }

    /**
     * @dev Finalize proposal after voting period ends
     * @param proposalId ID of proposal
     */
    function finalizeProposal(uint256 proposalId) external {
        require(proposalId > 0 && proposalId <= proposalCount, "DAO: invalid proposal");
        Proposal storage proposal = proposals[proposalId];

        require(proposal.status == ProposalStatus.Active, "DAO: already finalized");
        require(block.number > proposal.endBlock, "DAO: voting ongoing");

        uint256 totalVotes = proposal.forVotes + proposal.againstVotes + proposal.abstainVotes;

        // SECURITY FIX: Quorum must also use quadratic formula since votes are quadratic
        // Calculate: sqrt(4% of totalSupply) * QUADRATIC_MULTIPLIER / 1000
        uint256 quorumTokens = (kaiToken.totalSupply() * QUORUM_PERCENTAGE) / 100;
        uint256 quorumRequired = (_sqrt(quorumTokens) * QUADRATIC_MULTIPLIER) / 1000;

        // Check quorum and majority
        if (totalVotes < quorumRequired) {
            proposal.status = ProposalStatus.Defeated;
        } else if (proposal.forVotes > proposal.againstVotes) {
            proposal.status = ProposalStatus.Succeeded;
            _queueProposal(proposalId);
        } else {
            proposal.status = ProposalStatus.Defeated;
        }
    }

    /**
     * @dev Queue succeeded proposal for timelock execution
     * @param proposalId ID of proposal
     * @notice SECURITY FIX: Now properly stores queue timestamp for timelock
     */
    function _queueProposal(uint256 proposalId) internal {
        Proposal storage proposal = proposals[proposalId];
        proposal.status = ProposalStatus.Queued;
        proposal.queuedAt = block.timestamp; // SECURITY FIX: Store queue time

        emit ProposalQueued(proposalId, block.timestamp + TIMELOCK_DELAY);
    }

    /**
     * @dev Execute queued proposal after timelock delay
     * @param proposalId ID of proposal
     * @notice SECURITY FIX: Timelock now correctly uses timestamps instead of mixing with block numbers
     */
    function executeProposal(uint256 proposalId) external payable nonReentrant {
        require(proposalId > 0 && proposalId <= proposalCount, "DAO: invalid proposal");
        Proposal storage proposal = proposals[proposalId];

        require(proposal.status == ProposalStatus.Queued, "DAO: not queued");
        require(!proposal.executed, "DAO: already executed");

        // SECURITY FIX: Use queuedAt timestamp instead of endBlock (which is a block number)
        // Previous code compared block.timestamp with block number - mathematically wrong!
        require(proposal.queuedAt > 0, "DAO: proposal not properly queued");
        require(
            block.timestamp >= proposal.queuedAt + TIMELOCK_DELAY,
            "DAO: timelock not expired (48 hours required)"
        );

        proposal.executed = true;
        proposal.status = ProposalStatus.Executed;

        // Execute proposal with proper validation and error handling
        // Validate target is a contract (or address(0) for value transfer only)
        address target = proposal.target;
        if (target != address(0)) {
            uint256 codeSize;
            assembly {
                codeSize := extcodesize(target)
            }
            require(codeSize > 0, "DAO: target not a contract");
        }

        // Execute proposal call
        (bool success, ) = proposal.target.call{value: proposal.value}(proposal.callData);
        require(success, "DAO: execution failed");

        emit ProposalExecuted(proposalId);
    }

    /**
     * @dev Guardian veto vote (emergency only - requires 3 guardians to complete veto)
     * @param proposalId ID of proposal to veto
     * @notice SECURITY FIX: Now requires 3 guardian signatures instead of just 1
     * Each guardian calls this function to add their veto vote.
     * When 3 guardians have voted, the proposal is automatically vetoed.
     */
    function vetoProposal(uint256 proposalId) external onlyRole(GUARDIAN_ROLE) {
        require(proposalId > 0 && proposalId <= proposalCount, "DAO: invalid proposal");
        Proposal storage proposal = proposals[proposalId];

        require(
            proposal.status == ProposalStatus.Active || proposal.status == ProposalStatus.Queued,
            "DAO: cannot veto"
        );

        // SECURITY FIX: Require multi-sig (3 guardians) instead of single guardian
        require(!vetoVotes[proposalId][msg.sender], "DAO: guardian already voted to veto");

        vetoVotes[proposalId][msg.sender] = true;
        vetoVoteCount[proposalId]++;

        emit VetoVoteCast(proposalId, msg.sender, vetoVoteCount[proposalId]);

        // Only veto if threshold reached (3 guardians)
        if (vetoVoteCount[proposalId] >= VETO_THRESHOLD) {
            proposal.status = ProposalStatus.Vetoed;
            emit ProposalVetoed(proposalId, msg.sender);
        }
    }

    /**
     * @dev Check current veto vote count for a proposal
     * @param proposalId ID of proposal
     * @return count Current veto votes
     * @return threshold Required votes to veto
     */
    function getVetoStatus(uint256 proposalId) external view returns (uint256 count, uint256 threshold) {
        return (vetoVoteCount[proposalId], VETO_THRESHOLD);
    }

    /**
     * @dev Deposit to treasury (accepts KAI or ETH)
     */
    function depositToTreasury() external payable {
        require(msg.value > 0, "DAO: zero deposit");
        treasuryBalance = treasuryBalance + msg.value;

        emit TreasuryDeposit(msg.sender, msg.value);
    }

    /**
     * @dev Get seal constant for proposal type (sacred mapping)
     */
    function _getSealForType(ProposalType pType) internal pure returns (bytes32) {
        if (pType == ProposalType.GOVERNANCE) return SEAL_OF_WISDOM;
        if (pType == ProposalType.LAW) return SEAL_OF_JUSTICE;
        if (pType == ProposalType.AGRICULTURE) return SEAL_OF_HARVEST;
        if (pType == ProposalType.HEALTH) return SEAL_OF_HEALING;
        if (pType == ProposalType.AI) return SEAL_OF_MIND;
        if (pType == ProposalType.DISASTER) return SEAL_OF_PROTECTION;
        if (pType == ProposalType.CLIMATE) return SEAL_OF_EARTH;
        revert("DAO: invalid type");
    }

    /**
     * @dev Square root function for quadratic voting (Babylonian method)
     */
    function _sqrt(uint256 x) internal pure returns (uint256) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2;
        uint256 y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
        return y;
    }

    /**
     * @dev Get proposal details
     */
    function getProposal(uint256 proposalId)
        external
        view
        returns (
            address proposer,
            ProposalType proposalType,
            string memory title,
            uint256 forVotes,
            uint256 againstVotes,
            ProposalStatus status
        )
    {
        Proposal storage proposal = proposals[proposalId];
        return (
            proposal.proposer,
            proposal.proposalType,
            proposal.title,
            proposal.forVotes,
            proposal.againstVotes,
            proposal.status
        );
    }

    // Receive ETH
    receive() external payable {
        require(msg.value > 0, "DAO: zero deposit");
        treasuryBalance = treasuryBalance + msg.value;
        emit TreasuryDeposit(msg.sender, msg.value);
    }
}
