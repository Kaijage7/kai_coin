// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "../KAIToken.sol";

/**
 * @title KaiLaw
 * @dev Pillar 2: Evidence-Based Legal Enforcement
 *
 * Counters Seal 2: War and Division (Revelation 6:3-4)
 *
 * Features:
 * - Immutable evidence storage
 * - Smart contract penalties for violations
 * - Whistleblower rewards
 * - Cross-border legal data sharing
 */
contract KaiLaw is AccessControl, ReentrancyGuard, Pausable {
    bytes32 public constant AUDITOR_ROLE = keccak256("AUDITOR_ROLE");
    bytes32 public constant JUDGE_ROLE = keccak256("JUDGE_ROLE");
    bytes32 public constant ENFORCER_ROLE = keccak256("ENFORCER_ROLE");

    KAIToken public immutable kaiToken;

    // Fee configuration
    uint256 public evidenceSubmissionFee = 10 * 10**18; // 10 KAI
    uint256 public auditRequestFee = 100 * 10**18; // 100 KAI
    uint256 public whistleblowerBaseReward = 500 * 10**18; // 500 KAI base

    // Penalty ranges
    uint256 public minPenalty = 100 * 10**18;
    uint256 public maxPenalty = 100000 * 10**18;

    // Structs
    struct Evidence {
        uint256 id;
        address submitter;
        string evidenceType; // document, photo, video, satellite, sensor
        bytes32 contentHash; // IPFS hash
        bytes32 metadataHash;
        uint256 timestamp;
        string region;
        string category; // environmental, labor, land, resource
        bool verified;
        bool disputed;
    }

    struct LegalCase {
        uint256 id;
        address plaintiff;
        address defendant;
        string caseType; // environmental-violation, land-dispute, resource-extraction
        string jurisdiction;
        uint256[] evidenceIds;
        uint256 filedAt;
        uint256 resolvedAt;
        CaseStatus status;
        string ruling;
        uint256 penaltyAmount;
    }

    enum CaseStatus {
        Filed,
        UnderReview,
        Hearing,
        Resolved,
        Appealed,
        Dismissed
    }

    struct Audit {
        uint256 id;
        address requester;
        address target;
        string auditType; // environmental, compliance, financial
        uint256 requestedAt;
        uint256 completedAt;
        bytes32 reportHash;
        uint256 complianceScore; // 0-100
        string[] violations;
        bool completed;
    }

    struct WhistleblowerReport {
        uint256 id;
        address reporter; // Can be anonymous via relay
        string reportType;
        string region;
        bytes32 contentHash;
        uint256 timestamp;
        bool verified;
        bool rewarded;
        uint256 rewardAmount;
        uint256 linkedCaseId;
    }

    struct ComplianceRecord {
        address entity;
        string entityType; // corporation, government, individual
        uint256 totalAudits;
        uint256 totalViolations;
        uint256 totalPenaltiesPaid;
        uint256 lastAuditAt;
        uint256 complianceScore;
        bool blacklisted;
    }

    // State
    mapping(uint256 => Evidence) public evidenceRegistry;
    mapping(uint256 => LegalCase) public cases;
    mapping(uint256 => Audit) public audits;
    mapping(uint256 => WhistleblowerReport) public whistleblowerReports;
    mapping(address => ComplianceRecord) public complianceRecords;

    mapping(address => uint256[]) public entityCases;
    mapping(address => uint256[]) public entityAudits;
    mapping(bytes32 => bool) public evidenceHashes; // Prevent duplicates

    uint256 public evidenceCount;
    uint256 public caseCount;
    uint256 public auditCount;
    uint256 public reportCount;

    uint256 public enforcementFund;
    uint256 public totalPenaltiesCollected;
    uint256 public totalWhistleblowerRewards;

    // Events
    event EvidenceSubmitted(uint256 indexed evidenceId, address indexed submitter, string evidenceType);
    event EvidenceVerified(uint256 indexed evidenceId, bool verified);
    event CaseFiled(uint256 indexed caseId, address indexed plaintiff, address indexed defendant);
    event CaseStatusUpdated(uint256 indexed caseId, CaseStatus status);
    event CaseResolved(uint256 indexed caseId, string ruling, uint256 penalty);
    event AuditRequested(uint256 indexed auditId, address indexed target, string auditType);
    event AuditCompleted(uint256 indexed auditId, uint256 complianceScore);
    event WhistleblowerReportFiled(uint256 indexed reportId, string reportType);
    event WhistleblowerRewarded(uint256 indexed reportId, address indexed reporter, uint256 amount);
    event PenaltyCollected(address indexed violator, uint256 amount, uint256 caseId);

    constructor(address _kaiToken, address admin) {
        require(_kaiToken != address(0), "Invalid token");
        require(admin != address(0), "Invalid admin");

        kaiToken = KAIToken(_kaiToken);

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(AUDITOR_ROLE, admin);
        _grantRole(JUDGE_ROLE, admin);
        _grantRole(ENFORCER_ROLE, admin);
    }

    // ============ Evidence Functions ============

    /**
     * @dev Submit evidence
     */
    function submitEvidence(
        string calldata evidenceType,
        bytes32 contentHash,
        bytes32 metadataHash,
        string calldata region,
        string calldata category
    ) external nonReentrant whenNotPaused returns (uint256) {
        require(bytes(evidenceType).length > 0, "Type required");
        require(contentHash != bytes32(0), "Hash required");
        require(!evidenceHashes[contentHash], "Duplicate evidence");

        require(kaiToken.transferFrom(msg.sender, address(this), evidenceSubmissionFee), "Transfer failed");
        enforcementFund += evidenceSubmissionFee;

        evidenceCount++;
        uint256 evidenceId = evidenceCount;

        evidenceRegistry[evidenceId] = Evidence({
            id: evidenceId,
            submitter: msg.sender,
            evidenceType: evidenceType,
            contentHash: contentHash,
            metadataHash: metadataHash,
            timestamp: block.timestamp,
            region: region,
            category: category,
            verified: false,
            disputed: false
        });

        evidenceHashes[contentHash] = true;

        emit EvidenceSubmitted(evidenceId, msg.sender, evidenceType);

        return evidenceId;
    }

    /**
     * @dev Verify evidence (auditor only)
     */
    function verifyEvidence(uint256 evidenceId, bool isValid) external onlyRole(AUDITOR_ROLE) {
        Evidence storage evidence = evidenceRegistry[evidenceId];
        require(evidence.id != 0, "Not found");

        evidence.verified = isValid;

        emit EvidenceVerified(evidenceId, isValid);
    }

    /**
     * @dev Dispute evidence
     */
    function disputeEvidence(uint256 evidenceId) external {
        Evidence storage evidence = evidenceRegistry[evidenceId];
        require(evidence.id != 0, "Not found");
        require(evidence.verified, "Not verified");

        evidence.disputed = true;
    }

    // ============ Case Functions ============

    /**
     * @dev File legal case
     */
    function fileCase(
        address defendant,
        string calldata caseType,
        string calldata jurisdiction,
        uint256[] calldata evidenceIds
    ) external nonReentrant whenNotPaused returns (uint256) {
        require(defendant != address(0), "Invalid defendant");
        require(bytes(caseType).length > 0, "Type required");
        require(evidenceIds.length > 0, "Evidence required");

        // Verify all evidence exists
        for (uint256 i = 0; i < evidenceIds.length; i++) {
            require(evidenceRegistry[evidenceIds[i]].id != 0, "Evidence not found");
        }

        caseCount++;
        uint256 caseId = caseCount;

        cases[caseId] = LegalCase({
            id: caseId,
            plaintiff: msg.sender,
            defendant: defendant,
            caseType: caseType,
            jurisdiction: jurisdiction,
            evidenceIds: evidenceIds,
            filedAt: block.timestamp,
            resolvedAt: 0,
            status: CaseStatus.Filed,
            ruling: "",
            penaltyAmount: 0
        });

        entityCases[msg.sender].push(caseId);
        entityCases[defendant].push(caseId);

        emit CaseFiled(caseId, msg.sender, defendant);

        return caseId;
    }

    /**
     * @dev Update case status (judge only)
     */
    function updateCaseStatus(uint256 caseId, CaseStatus newStatus) external onlyRole(JUDGE_ROLE) {
        LegalCase storage legalCase = cases[caseId];
        require(legalCase.id != 0, "Not found");

        legalCase.status = newStatus;

        emit CaseStatusUpdated(caseId, newStatus);
    }

    /**
     * @dev Resolve case with ruling (judge only)
     */
    function resolveCase(
        uint256 caseId,
        string calldata ruling,
        uint256 penaltyAmount
    ) external onlyRole(JUDGE_ROLE) {
        LegalCase storage legalCase = cases[caseId];
        require(legalCase.id != 0, "Not found");
        require(legalCase.status != CaseStatus.Resolved, "Already resolved");

        if (penaltyAmount > 0) {
            require(penaltyAmount >= minPenalty && penaltyAmount <= maxPenalty, "Invalid penalty");
        }

        legalCase.ruling = ruling;
        legalCase.penaltyAmount = penaltyAmount;
        legalCase.resolvedAt = block.timestamp;
        legalCase.status = CaseStatus.Resolved;

        // Update compliance record
        ComplianceRecord storage record = complianceRecords[legalCase.defendant];
        if (record.entity == address(0)) {
            record.entity = legalCase.defendant;
            record.entityType = "unknown";
        }
        record.totalViolations++;

        emit CaseResolved(caseId, ruling, penaltyAmount);
    }

    /**
     * @dev Collect penalty from violator
     */
    function collectPenalty(uint256 caseId) external nonReentrant {
        LegalCase storage legalCase = cases[caseId];
        require(legalCase.status == CaseStatus.Resolved, "Not resolved");
        require(legalCase.penaltyAmount > 0, "No penalty");

        require(
            kaiToken.transferFrom(legalCase.defendant, address(this), legalCase.penaltyAmount),
            "Transfer failed"
        );

        // 70% to enforcement fund, 30% burned
        uint256 toFund = (legalCase.penaltyAmount * 70) / 100;
        uint256 toBurn = legalCase.penaltyAmount - toFund;

        enforcementFund += toFund;
        totalPenaltiesCollected += legalCase.penaltyAmount;
        kaiToken.burn(toBurn);

        ComplianceRecord storage record = complianceRecords[legalCase.defendant];
        record.totalPenaltiesPaid += legalCase.penaltyAmount;

        emit PenaltyCollected(legalCase.defendant, legalCase.penaltyAmount, caseId);
    }

    // ============ Audit Functions ============

    /**
     * @dev Request audit
     */
    function requestAudit(
        address target,
        string calldata auditType
    ) external nonReentrant whenNotPaused returns (uint256) {
        require(target != address(0), "Invalid target");

        require(kaiToken.transferFrom(msg.sender, address(this), auditRequestFee), "Transfer failed");
        enforcementFund += auditRequestFee;

        auditCount++;
        uint256 auditId = auditCount;

        string[] memory emptyViolations;

        audits[auditId] = Audit({
            id: auditId,
            requester: msg.sender,
            target: target,
            auditType: auditType,
            requestedAt: block.timestamp,
            completedAt: 0,
            reportHash: bytes32(0),
            complianceScore: 0,
            violations: emptyViolations,
            completed: false
        });

        entityAudits[target].push(auditId);

        emit AuditRequested(auditId, target, auditType);

        return auditId;
    }

    /**
     * @dev Complete audit (auditor only)
     */
    function completeAudit(
        uint256 auditId,
        bytes32 reportHash,
        uint256 complianceScore,
        string[] calldata violations
    ) external onlyRole(AUDITOR_ROLE) {
        require(complianceScore <= 100, "Invalid score");

        Audit storage audit = audits[auditId];
        require(audit.id != 0, "Not found");
        require(!audit.completed, "Already completed");

        audit.reportHash = reportHash;
        audit.complianceScore = complianceScore;
        audit.violations = violations;
        audit.completedAt = block.timestamp;
        audit.completed = true;

        // Update compliance record
        ComplianceRecord storage record = complianceRecords[audit.target];
        if (record.entity == address(0)) {
            record.entity = audit.target;
            record.entityType = "unknown";
        }
        record.totalAudits++;
        record.lastAuditAt = block.timestamp;
        record.complianceScore = complianceScore;

        if (complianceScore < 30) {
            record.blacklisted = true;
        }

        emit AuditCompleted(auditId, complianceScore);
    }

    // ============ Whistleblower Functions ============

    /**
     * @dev File whistleblower report
     */
    function fileWhistleblowerReport(
        string calldata reportType,
        string calldata region,
        bytes32 contentHash
    ) external whenNotPaused returns (uint256) {
        require(bytes(reportType).length > 0, "Type required");
        require(contentHash != bytes32(0), "Hash required");

        reportCount++;
        uint256 reportId = reportCount;

        whistleblowerReports[reportId] = WhistleblowerReport({
            id: reportId,
            reporter: msg.sender,
            reportType: reportType,
            region: region,
            contentHash: contentHash,
            timestamp: block.timestamp,
            verified: false,
            rewarded: false,
            rewardAmount: 0,
            linkedCaseId: 0
        });

        emit WhistleblowerReportFiled(reportId, reportType);

        return reportId;
    }

    /**
     * @dev Verify and reward whistleblower
     */
    function verifyAndRewardWhistleblower(
        uint256 reportId,
        uint256 linkedCaseId,
        uint256 rewardMultiplier // 1-10x base reward
    ) external onlyRole(ENFORCER_ROLE) nonReentrant {
        require(rewardMultiplier >= 1 && rewardMultiplier <= 10, "Invalid multiplier");

        WhistleblowerReport storage report = whistleblowerReports[reportId];
        require(report.id != 0, "Not found");
        require(!report.rewarded, "Already rewarded");

        report.verified = true;
        report.linkedCaseId = linkedCaseId;

        uint256 reward = whistleblowerBaseReward * rewardMultiplier;

        if (enforcementFund >= reward) {
            enforcementFund -= reward;
            report.rewardAmount = reward;
            report.rewarded = true;
            totalWhistleblowerRewards += reward;

            kaiToken.transfer(report.reporter, reward);

            emit WhistleblowerRewarded(reportId, report.reporter, reward);
        }
    }

    // ============ Admin Functions ============

    function setFees(
        uint256 evidenceFee,
        uint256 auditFee,
        uint256 whistleblowerReward
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        evidenceSubmissionFee = evidenceFee;
        auditRequestFee = auditFee;
        whistleblowerBaseReward = whistleblowerReward;
    }

    function setPenaltyRange(uint256 min, uint256 max) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(min < max, "Invalid range");
        minPenalty = min;
        maxPenalty = max;
    }

    function removeBlacklist(address entity) external onlyRole(DEFAULT_ADMIN_ROLE) {
        complianceRecords[entity].blacklisted = false;
    }

    function depositToFund(uint256 amount) external nonReentrant {
        require(kaiToken.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        enforcementFund += amount;
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // ============ View Functions ============

    function getEvidence(uint256 evidenceId) external view returns (Evidence memory) {
        return evidenceRegistry[evidenceId];
    }

    function getCase(uint256 caseId) external view returns (LegalCase memory) {
        return cases[caseId];
    }

    function getAudit(uint256 auditId) external view returns (Audit memory) {
        return audits[auditId];
    }

    function getWhistleblowerReport(uint256 reportId) external view returns (WhistleblowerReport memory) {
        return whistleblowerReports[reportId];
    }

    function getComplianceRecord(address entity) external view returns (ComplianceRecord memory) {
        return complianceRecords[entity];
    }

    function getEntityCases(address entity) external view returns (uint256[] memory) {
        return entityCases[entity];
    }
}
