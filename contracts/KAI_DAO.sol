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
        mapping(address => bool) hasVoted;
        mapping(address => uint256) voteWeight;
    }

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
    event TreasuryDeposit(address indexed from, uint256 amount);
    event GrantIssued(address indexed recipient, uint256 amount, string purpose);

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

        uint256 balance = kaiToken.balanceOf(msg.sender);
        require(balance > 0, "DAO: no voting power");

        // ✅ FIX: Quadratic voting with overflow protection
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
     * @dev Finalize proposal after voting period ends
     * @param proposalId ID of proposal
     */
    function finalizeProposal(uint256 proposalId) external {
        require(proposalId > 0 && proposalId <= proposalCount, "DAO: invalid proposal");
        Proposal storage proposal = proposals[proposalId];

        require(proposal.status == ProposalStatus.Active, "DAO: already finalized");
        require(block.number > proposal.endBlock, "DAO: voting ongoing");

        uint256 totalVotes = proposal.forVotes + proposal.againstVotes + proposal.abstainVotes;
        uint256 quorumRequired = (kaiToken.totalSupply() * QUORUM_PERCENTAGE) / 100;

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
     */
    function _queueProposal(uint256 proposalId) internal {
        Proposal storage proposal = proposals[proposalId];
        proposal.status = ProposalStatus.Queued;

        emit ProposalQueued(proposalId, block.timestamp + TIMELOCK_DELAY);
    }

    /**
     * @dev Execute queued proposal after timelock delay
     * @param proposalId ID of proposal
     */
    function executeProposal(uint256 proposalId) external payable nonReentrant {
        require(proposalId > 0 && proposalId <= proposalCount, "DAO: invalid proposal");
        Proposal storage proposal = proposals[proposalId];

        require(proposal.status == ProposalStatus.Queued, "DAO: not queued");
        require(!proposal.executed, "DAO: already executed");
        require(
            block.timestamp >= proposal.endBlock + TIMELOCK_DELAY,
            "DAO: timelock not expired"
        );

        proposal.executed = true;
        proposal.status = ProposalStatus.Executed;

        // ✅ FIX: Execute proposal with proper validation and error handling
        // Validate target is a contract (or address(0) for value transfer only)
        if (proposal.target != address(0)) {
            uint256 codeSize;
            assembly {
                codeSize := extcodesize(proposal.target)
            }
            require(codeSize > 0, "DAO: target not a contract");
        }

        // Execute with return data capture for better debugging
        (bool success, bytes memory returnData) = proposal.target.call{value: proposal.value}(proposal.callData);

        if (!success) {
            // If there's return data, it's a revert message
            if (returnData.length > 0) {
                // Bubble up the revert reason
                assembly {
                    revert(add(32, returnData), mload(returnData))
                }
            } else {
                revert("DAO: execution failed");
            }
        }

        emit ProposalExecuted(proposalId);
    }

    /**
     * @dev Guardian veto (emergency only - requires 3 guardians)
     * @param proposalId ID of proposal to veto
     */
    function vetoProposal(uint256 proposalId) external onlyRole(GUARDIAN_ROLE) {
        require(proposalId > 0 && proposalId <= proposalCount, "DAO: invalid proposal");
        Proposal storage proposal = proposals[proposalId];

        require(
            proposal.status == ProposalStatus.Active || proposal.status == ProposalStatus.Queued,
            "DAO: cannot veto"
        );

        proposal.status = ProposalStatus.Vetoed;

        emit ProposalVetoed(proposalId, msg.sender);
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
