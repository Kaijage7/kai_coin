// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "../KAIToken.sol";

/**
 * @title KaiGovernance
 * @dev Pillar 1: Voting & Accountability (DAO Governance)
 *
 * Counters Seal 1: Conquest (Revelation 6:1-2)
 *
 * Features:
 * - Quadratic voting to prevent plutocracy
 * - Transparent fund allocation
 * - Community proposals
 * - Timelock for execution
 */
contract KaiGovernance is AccessControl, ReentrancyGuard, Pausable {
    bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");

    KAIToken public immutable kaiToken;

    // Configuration
    uint256 public proposalDeposit = 10000 * 10**18; // 10,000 KAI
    uint256 public votingPeriod = 5 days;
    uint256 public discussionPeriod = 7 days;
    uint256 public timelockDelay = 2 days;
    uint256 public quorumPercentage = 10; // 10% of circulating supply
    uint256 public approvalThreshold = 60; // 60% approval needed

    // Structs
    struct Proposal {
        uint256 id;
        address proposer;
        string title;
        string description;
        bytes32 documentHash; // IPFS hash
        ProposalType proposalType;
        uint256 fundingAmount; // If funding proposal
        address fundingRecipient;
        uint256 createdAt;
        uint256 discussionEndsAt;
        uint256 votingEndsAt;
        uint256 executionTime;
        ProposalStatus status;
        uint256 forVotes;
        uint256 againstVotes;
        uint256 abstainVotes;
        bool executed;
    }

    enum ProposalType {
        Funding,          // Treasury allocation
        Parameter,        // System parameter change
        Pillar,          // Pillar-specific decision
        Emergency,        // Emergency action
        Constitutional    // Major governance change
    }

    enum ProposalStatus {
        Discussion,
        Voting,
        Pending,    // Passed, awaiting timelock
        Queued,     // In timelock
        Executed,
        Rejected,
        Cancelled,
        Expired
    }

    struct Vote {
        address voter;
        uint256 proposalId;
        uint256 votePower; // Quadratic
        VoteChoice choice;
        uint256 timestamp;
    }

    enum VoteChoice {
        For,
        Against,
        Abstain
    }

    struct Council {
        string name;
        string pillar; // governance, climate, disaster, etc.
        address[] members;
        uint256 createdAt;
        bool active;
    }

    // State
    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => Vote)) public proposalVotes;
    mapping(uint256 => address[]) public proposalVoters;
    mapping(address => uint256) public stakedForVoting;
    mapping(uint256 => Council) public councils;

    uint256 public proposalCount;
    uint256 public councilCount;
    uint256 public treasuryBalance;

    // Delegation
    mapping(address => address) public delegates;
    mapping(address => uint256) public delegatedPower;

    // Events
    event ProposalCreated(uint256 indexed proposalId, address indexed proposer, string title, ProposalType proposalType);
    event ProposalStatusChanged(uint256 indexed proposalId, ProposalStatus status);
    event Voted(uint256 indexed proposalId, address indexed voter, VoteChoice choice, uint256 votePower);
    event ProposalExecuted(uint256 indexed proposalId);
    event ProposalCancelled(uint256 indexed proposalId, string reason);
    event TokensStaked(address indexed staker, uint256 amount);
    event TokensUnstaked(address indexed staker, uint256 amount);
    event Delegated(address indexed delegator, address indexed delegatee);
    event CouncilCreated(uint256 indexed councilId, string name, string pillar);
    event TreasuryDeposit(address indexed from, uint256 amount);
    event TreasuryWithdrawal(address indexed to, uint256 amount, uint256 proposalId);

    constructor(address _kaiToken, address admin) {
        require(_kaiToken != address(0), "Invalid token");
        require(admin != address(0), "Invalid admin");

        kaiToken = KAIToken(_kaiToken);

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(EXECUTOR_ROLE, admin);
        _grantRole(GUARDIAN_ROLE, admin);
    }

    // ============ Staking Functions ============

    /**
     * @dev Stake tokens for voting power
     */
    function stake(uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "Amount required");
        require(kaiToken.transferFrom(msg.sender, address(this), amount), "Transfer failed");

        stakedForVoting[msg.sender] += amount;

        emit TokensStaked(msg.sender, amount);
    }

    /**
     * @dev Unstake tokens
     */
    function unstake(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount required");
        require(stakedForVoting[msg.sender] >= amount, "Insufficient stake");

        stakedForVoting[msg.sender] -= amount;
        require(kaiToken.transfer(msg.sender, amount), "Transfer failed");

        emit TokensUnstaked(msg.sender, amount);
    }

    /**
     * @dev Delegate voting power
     */
    function delegate(address delegatee) external {
        require(delegatee != address(0), "Invalid delegatee");
        require(delegatee != msg.sender, "Cannot self-delegate");

        address oldDelegate = delegates[msg.sender];
        if (oldDelegate != address(0)) {
            delegatedPower[oldDelegate] -= stakedForVoting[msg.sender];
        }

        delegates[msg.sender] = delegatee;
        delegatedPower[delegatee] += stakedForVoting[msg.sender];

        emit Delegated(msg.sender, delegatee);
    }

    /**
     * @dev Get total voting power (own + delegated)
     */
    function getVotingPower(address account) public view returns (uint256) {
        uint256 ownPower = stakedForVoting[account];
        uint256 delegated = delegatedPower[account];

        // Subtract delegated-away power
        if (delegates[account] != address(0)) {
            ownPower = 0;
        }

        return ownPower + delegated;
    }

    /**
     * @dev Calculate quadratic vote cost
     */
    function calculateQuadraticCost(uint256 votes) public pure returns (uint256) {
        return votes * votes * 10**18; // N votes costs N² tokens
    }

    // ============ Proposal Functions ============

    /**
     * @dev Create proposal
     */
    function createProposal(
        string calldata title,
        string calldata description,
        bytes32 documentHash,
        ProposalType proposalType,
        uint256 fundingAmount,
        address fundingRecipient
    ) external nonReentrant whenNotPaused returns (uint256) {
        require(bytes(title).length > 0, "Title required");
        require(getVotingPower(msg.sender) >= proposalDeposit, "Insufficient voting power");

        // Lock deposit
        require(stakedForVoting[msg.sender] >= proposalDeposit, "Insufficient stake for deposit");

        proposalCount++;
        uint256 proposalId = proposalCount;

        proposals[proposalId] = Proposal({
            id: proposalId,
            proposer: msg.sender,
            title: title,
            description: description,
            documentHash: documentHash,
            proposalType: proposalType,
            fundingAmount: fundingAmount,
            fundingRecipient: fundingRecipient,
            createdAt: block.timestamp,
            discussionEndsAt: block.timestamp + discussionPeriod,
            votingEndsAt: block.timestamp + discussionPeriod + votingPeriod,
            executionTime: 0,
            status: ProposalStatus.Discussion,
            forVotes: 0,
            againstVotes: 0,
            abstainVotes: 0,
            executed: false
        });

        emit ProposalCreated(proposalId, msg.sender, title, proposalType);

        return proposalId;
    }

    /**
     * @dev Start voting on proposal
     */
    function startVoting(uint256 proposalId) external {
        Proposal storage proposal = proposals[proposalId];
        require(proposal.status == ProposalStatus.Discussion, "Not in discussion");
        require(block.timestamp >= proposal.discussionEndsAt, "Discussion period not over");

        proposal.status = ProposalStatus.Voting;

        emit ProposalStatusChanged(proposalId, ProposalStatus.Voting);
    }

    /**
     * @dev Vote on proposal (quadratic voting)
     */
    function vote(
        uint256 proposalId,
        VoteChoice choice,
        uint256 voteCount
    ) external nonReentrant whenNotPaused {
        Proposal storage proposal = proposals[proposalId];
        require(proposal.status == ProposalStatus.Voting, "Not in voting");
        require(block.timestamp < proposal.votingEndsAt, "Voting ended");
        require(proposalVotes[proposalId][msg.sender].voter == address(0), "Already voted");

        // Calculate quadratic cost
        uint256 cost = calculateQuadraticCost(voteCount);
        uint256 votingPower = getVotingPower(msg.sender);
        require(votingPower >= cost, "Insufficient voting power");

        // Record vote
        proposalVotes[proposalId][msg.sender] = Vote({
            voter: msg.sender,
            proposalId: proposalId,
            votePower: voteCount,
            choice: choice,
            timestamp: block.timestamp
        });

        proposalVoters[proposalId].push(msg.sender);

        // Update vote counts
        if (choice == VoteChoice.For) {
            proposal.forVotes += voteCount;
        } else if (choice == VoteChoice.Against) {
            proposal.againstVotes += voteCount;
        } else {
            proposal.abstainVotes += voteCount;
        }

        emit Voted(proposalId, msg.sender, choice, voteCount);
    }

    /**
     * @dev Finalize proposal after voting
     */
    function finalizeProposal(uint256 proposalId) external {
        Proposal storage proposal = proposals[proposalId];
        require(proposal.status == ProposalStatus.Voting, "Not in voting");
        require(block.timestamp >= proposal.votingEndsAt, "Voting not ended");

        uint256 totalVotes = proposal.forVotes + proposal.againstVotes + proposal.abstainVotes;
        uint256 circulatingSupply = kaiToken.totalSupply() - kaiToken.balanceOf(address(this));
        uint256 quorum = (circulatingSupply * quorumPercentage) / 100 / 10**18; // Simplified

        // Check quorum and approval
        bool quorumMet = totalVotes >= quorum;
        bool approved = proposal.forVotes * 100 > (proposal.forVotes + proposal.againstVotes) * approvalThreshold;

        if (quorumMet && approved) {
            proposal.status = ProposalStatus.Queued;
            proposal.executionTime = block.timestamp + timelockDelay;
        } else {
            proposal.status = ProposalStatus.Rejected;
            // Return deposit with penalty
            uint256 returnAmount = (proposalDeposit * 80) / 100; // 20% burned
            stakedForVoting[proposal.proposer] += returnAmount;
            kaiToken.burn(proposalDeposit - returnAmount);
        }

        emit ProposalStatusChanged(proposalId, proposal.status);
    }

    /**
     * @dev Execute proposal after timelock
     */
    function executeProposal(uint256 proposalId) external onlyRole(EXECUTOR_ROLE) nonReentrant {
        Proposal storage proposal = proposals[proposalId];
        require(proposal.status == ProposalStatus.Queued, "Not queued");
        require(block.timestamp >= proposal.executionTime, "Timelock not passed");
        require(!proposal.executed, "Already executed");

        proposal.executed = true;
        proposal.status = ProposalStatus.Executed;

        // Execute based on type
        if (proposal.proposalType == ProposalType.Funding && proposal.fundingAmount > 0) {
            require(treasuryBalance >= proposal.fundingAmount, "Insufficient treasury");
            treasuryBalance -= proposal.fundingAmount;
            require(kaiToken.transfer(proposal.fundingRecipient, proposal.fundingAmount), "Transfer failed");

            emit TreasuryWithdrawal(proposal.fundingRecipient, proposal.fundingAmount, proposalId);
        }

        // Return deposit
        stakedForVoting[proposal.proposer] += proposalDeposit;

        emit ProposalExecuted(proposalId);
        emit ProposalStatusChanged(proposalId, ProposalStatus.Executed);
    }

    /**
     * @dev Cancel proposal (guardian or proposer)
     */
    function cancelProposal(uint256 proposalId, string calldata reason) external {
        Proposal storage proposal = proposals[proposalId];
        require(
            msg.sender == proposal.proposer || hasRole(GUARDIAN_ROLE, msg.sender),
            "Not authorized"
        );
        require(proposal.status != ProposalStatus.Executed, "Already executed");
        require(proposal.status != ProposalStatus.Cancelled, "Already cancelled");

        proposal.status = ProposalStatus.Cancelled;

        // Return deposit (full if cancelled by proposer during discussion)
        if (proposal.status == ProposalStatus.Discussion) {
            stakedForVoting[proposal.proposer] += proposalDeposit;
        } else {
            // Partial return if cancelled later
            uint256 returnAmount = (proposalDeposit * 50) / 100;
            stakedForVoting[proposal.proposer] += returnAmount;
            kaiToken.burn(proposalDeposit - returnAmount);
        }

        emit ProposalCancelled(proposalId, reason);
        emit ProposalStatusChanged(proposalId, ProposalStatus.Cancelled);
    }

    // ============ Treasury Functions ============

    /**
     * @dev Deposit to treasury
     */
    function depositToTreasury(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount required");
        require(kaiToken.transferFrom(msg.sender, address(this), amount), "Transfer failed");

        treasuryBalance += amount;

        emit TreasuryDeposit(msg.sender, amount);
    }

    // ============ Council Functions ============

    /**
     * @dev Create council
     */
    function createCouncil(
        string calldata name,
        string calldata pillar,
        address[] calldata members
    ) external onlyRole(DEFAULT_ADMIN_ROLE) returns (uint256) {
        require(bytes(name).length > 0, "Name required");
        require(members.length > 0, "Members required");

        councilCount++;
        uint256 councilId = councilCount;

        councils[councilId] = Council({
            name: name,
            pillar: pillar,
            members: members,
            createdAt: block.timestamp,
            active: true
        });

        emit CouncilCreated(councilId, name, pillar);

        return councilId;
    }

    // ============ Admin Functions ============

    function setProposalDeposit(uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        proposalDeposit = amount;
    }

    function setVotingPeriod(uint256 period) external onlyRole(DEFAULT_ADMIN_ROLE) {
        votingPeriod = period;
    }

    function setDiscussionPeriod(uint256 period) external onlyRole(DEFAULT_ADMIN_ROLE) {
        discussionPeriod = period;
    }

    function setTimelockDelay(uint256 delay) external onlyRole(DEFAULT_ADMIN_ROLE) {
        timelockDelay = delay;
    }

    function setQuorum(uint256 percentage) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(percentage <= 100, "Invalid percentage");
        quorumPercentage = percentage;
    }

    function setApprovalThreshold(uint256 threshold) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(threshold <= 100, "Invalid threshold");
        approvalThreshold = threshold;
    }

    function pause() external onlyRole(GUARDIAN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(GUARDIAN_ROLE) {
        _unpause();
    }

    // ============ View Functions ============

    function getProposal(uint256 proposalId) external view returns (Proposal memory) {
        return proposals[proposalId];
    }

    function getProposalVoters(uint256 proposalId) external view returns (address[] memory) {
        return proposalVoters[proposalId];
    }

    function getVote(uint256 proposalId, address voter) external view returns (Vote memory) {
        return proposalVotes[proposalId][voter];
    }

    function getCouncil(uint256 councilId) external view returns (Council memory) {
        return councils[councilId];
    }

    function getStakedBalance(address account) external view returns (uint256) {
        return stakedForVoting[account];
    }
}
