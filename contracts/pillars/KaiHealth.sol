// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "../core/KaiToken.sol";

/**
 * @title KaiHealth
 * @dev Pillar 4: Health & Food Safety (Inspections, Traceability & Certification)
 *
 * Counters Seal 4: Death and Plague (Revelation 6:7-8)
 *
 * Features:
 * - AI-driven risk scoring for supply chain nodes
 * - QR-code traceability for food products
 * - Certification marketplace for safe producers
 * - Real-time outbreak detection alerts
 */
contract KaiHealth is AccessControl, ReentrancyGuard, Pausable {
    bytes32 public constant INSPECTOR_ROLE = keccak256("INSPECTOR_ROLE");
    bytes32 public constant CERTIFIER_ROLE = keccak256("CERTIFIER_ROLE");

    KaiToken public immutable kaiToken;

    // Fee configuration
    uint256 public inspectionFee = 20 * 10**18; // 20 KAI
    uint256 public certificationFee = 100 * 10**18; // 100 KAI
    uint256 public traceabilityFee = 5 * 10**18; // 5 KAI per product

    // Risk thresholds
    uint256 public highRiskThreshold = 70; // Score >= 70 = high risk
    uint256 public criticalRiskThreshold = 90; // Score >= 90 = critical

    // Structs
    struct Producer {
        address wallet;
        string name;
        string producerType; // farm, processor, distributor, retailer
        string location;
        uint256 registeredAt;
        uint256 riskScore; // 0-100
        uint256 inspectionCount;
        uint256 lastInspection;
        bool certified;
        bool blacklisted;
    }

    struct Product {
        uint256 id;
        address producer;
        string name;
        string category; // poultry, produce, dairy, etc.
        uint256 createdAt;
        bytes32 batchHash;
        uint256 riskScore;
        bool recalled;
    }

    struct Inspection {
        uint256 id;
        address producer;
        address inspector;
        uint256 timestamp;
        uint256 riskScore;
        string findings;
        bytes32 evidenceHash; // IPFS hash
        bool passed;
    }

    struct Certification {
        uint256 id;
        address producer;
        string certType; // HACCP, ISO22000, organic, halal
        uint256 issuedAt;
        uint256 expiresAt;
        bool valid;
    }

    struct TraceEntry {
        uint256 productId;
        address handler;
        string action; // harvested, processed, shipped, stored, sold
        uint256 timestamp;
        string location;
        bytes32 dataHash;
    }

    struct OutbreakAlert {
        uint256 id;
        string pathogen; // salmonella, ecoli, aflatoxin, etc.
        string region;
        uint256 severity; // 1-10
        uint256 timestamp;
        uint256[] linkedProducts;
        bool active;
    }

    // State
    mapping(address => Producer) public producers;
    mapping(uint256 => Product) public products;
    mapping(uint256 => Inspection) public inspections;
    mapping(uint256 => Certification) public certifications;
    mapping(uint256 => TraceEntry[]) public productTrace;
    mapping(uint256 => OutbreakAlert) public outbreaks;

    mapping(address => uint256[]) public producerProducts;
    mapping(address => uint256[]) public producerInspections;
    mapping(address => uint256[]) public producerCertifications;

    uint256 public producerCount;
    uint256 public productCount;
    uint256 public inspectionCount;
    uint256 public certificationCount;
    uint256 public outbreakCount;

    uint256 public healthFund; // For outbreak response

    // Events
    event ProducerRegistered(address indexed producer, string name, string producerType);
    event ProducerBlacklisted(address indexed producer, string reason);
    event ProductCreated(uint256 indexed productId, address indexed producer, string name);
    event ProductRecalled(uint256 indexed productId, string reason);
    event InspectionCompleted(uint256 indexed inspectionId, address indexed producer, uint256 riskScore, bool passed);
    event CertificationIssued(uint256 indexed certId, address indexed producer, string certType);
    event CertificationRevoked(uint256 indexed certId, string reason);
    event TraceEntryAdded(uint256 indexed productId, address indexed handler, string action);
    event OutbreakDeclared(uint256 indexed outbreakId, string pathogen, string region, uint256 severity);
    event OutbreakResolved(uint256 indexed outbreakId);

    constructor(address _kaiToken, address admin) {
        require(_kaiToken != address(0), "Invalid token");
        require(admin != address(0), "Invalid admin");

        kaiToken = KaiToken(_kaiToken);

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(INSPECTOR_ROLE, admin);
        _grantRole(CERTIFIER_ROLE, admin);
    }

    // ============ Producer Functions ============

    /**
     * @dev Register as a producer
     */
    function registerProducer(
        string calldata name,
        string calldata producerType,
        string calldata location
    ) external whenNotPaused {
        require(bytes(name).length > 0, "Name required");
        require(bytes(producerType).length > 0, "Type required");
        require(producers[msg.sender].wallet == address(0), "Already registered");

        producers[msg.sender] = Producer({
            wallet: msg.sender,
            name: name,
            producerType: producerType,
            location: location,
            registeredAt: block.timestamp,
            riskScore: 50, // Start at neutral
            inspectionCount: 0,
            lastInspection: 0,
            certified: false,
            blacklisted: false
        });

        producerCount++;

        emit ProducerRegistered(msg.sender, name, producerType);
    }

    /**
     * @dev Request inspection
     */
    function requestInspection() external nonReentrant whenNotPaused {
        Producer storage producer = producers[msg.sender];
        require(producer.wallet != address(0), "Not registered");
        require(!producer.blacklisted, "Blacklisted");

        require(kaiToken.transferFrom(msg.sender, address(this), inspectionFee), "Transfer failed");

        // 70% to health fund, 30% burned
        healthFund += (inspectionFee * 70) / 100;
        kaiToken.burn((inspectionFee * 30) / 100);
    }

    // ============ Inspection Functions ============

    /**
     * @dev Complete inspection (inspector only)
     */
    function completeInspection(
        address producerAddr,
        uint256 riskScore,
        string calldata findings,
        bytes32 evidenceHash
    ) external onlyRole(INSPECTOR_ROLE) returns (uint256) {
        require(riskScore <= 100, "Invalid score");
        Producer storage producer = producers[producerAddr];
        require(producer.wallet != address(0), "Not registered");

        inspectionCount++;
        uint256 inspectionId = inspectionCount;

        bool passed = riskScore < highRiskThreshold;

        inspections[inspectionId] = Inspection({
            id: inspectionId,
            producer: producerAddr,
            inspector: msg.sender,
            timestamp: block.timestamp,
            riskScore: riskScore,
            findings: findings,
            evidenceHash: evidenceHash,
            passed: passed
        });

        producer.riskScore = riskScore;
        producer.inspectionCount++;
        producer.lastInspection = block.timestamp;

        producerInspections[producerAddr].push(inspectionId);

        // Auto-blacklist for critical risk
        if (riskScore >= criticalRiskThreshold) {
            producer.blacklisted = true;
            producer.certified = false;
            emit ProducerBlacklisted(producerAddr, "Critical risk score");
        }

        emit InspectionCompleted(inspectionId, producerAddr, riskScore, passed);

        return inspectionId;
    }

    // ============ Certification Functions ============

    /**
     * @dev Request certification
     */
    function requestCertification(string calldata certType) external nonReentrant whenNotPaused {
        Producer storage producer = producers[msg.sender];
        require(producer.wallet != address(0), "Not registered");
        require(!producer.blacklisted, "Blacklisted");
        require(producer.riskScore < highRiskThreshold, "Risk too high");
        require(producer.inspectionCount > 0, "No inspections");

        require(kaiToken.transferFrom(msg.sender, address(this), certificationFee), "Transfer failed");

        healthFund += (certificationFee * 70) / 100;
        kaiToken.burn((certificationFee * 30) / 100);
    }

    /**
     * @dev Issue certification (certifier only)
     */
    function issueCertification(
        address producerAddr,
        string calldata certType,
        uint256 validDays
    ) external onlyRole(CERTIFIER_ROLE) returns (uint256) {
        Producer storage producer = producers[producerAddr];
        require(producer.wallet != address(0), "Not registered");
        require(!producer.blacklisted, "Blacklisted");

        certificationCount++;
        uint256 certId = certificationCount;

        certifications[certId] = Certification({
            id: certId,
            producer: producerAddr,
            certType: certType,
            issuedAt: block.timestamp,
            expiresAt: block.timestamp + (validDays * 1 days),
            valid: true
        });

        producer.certified = true;
        producerCertifications[producerAddr].push(certId);

        emit CertificationIssued(certId, producerAddr, certType);

        return certId;
    }

    /**
     * @dev Revoke certification
     */
    function revokeCertification(uint256 certId, string calldata reason) external onlyRole(CERTIFIER_ROLE) {
        Certification storage cert = certifications[certId];
        require(cert.id != 0, "Not found");
        require(cert.valid, "Already revoked");

        cert.valid = false;
        producers[cert.producer].certified = false;

        emit CertificationRevoked(certId, reason);
    }

    // ============ Product Traceability ============

    /**
     * @dev Register product
     */
    function registerProduct(
        string calldata name,
        string calldata category,
        bytes32 batchHash
    ) external nonReentrant whenNotPaused returns (uint256) {
        Producer storage producer = producers[msg.sender];
        require(producer.wallet != address(0), "Not registered");
        require(!producer.blacklisted, "Blacklisted");

        require(kaiToken.transferFrom(msg.sender, address(this), traceabilityFee), "Transfer failed");
        healthFund += traceabilityFee;

        productCount++;
        uint256 productId = productCount;

        products[productId] = Product({
            id: productId,
            producer: msg.sender,
            name: name,
            category: category,
            createdAt: block.timestamp,
            batchHash: batchHash,
            riskScore: producer.riskScore,
            recalled: false
        });

        producerProducts[msg.sender].push(productId);

        // Initial trace entry
        productTrace[productId].push(TraceEntry({
            productId: productId,
            handler: msg.sender,
            action: "created",
            timestamp: block.timestamp,
            location: producer.location,
            dataHash: batchHash
        }));

        emit ProductCreated(productId, msg.sender, name);

        return productId;
    }

    /**
     * @dev Add trace entry
     */
    function addTraceEntry(
        uint256 productId,
        string calldata action,
        string calldata location,
        bytes32 dataHash
    ) external whenNotPaused {
        Product storage product = products[productId];
        require(product.id != 0, "Product not found");
        require(!product.recalled, "Product recalled");

        productTrace[productId].push(TraceEntry({
            productId: productId,
            handler: msg.sender,
            action: action,
            timestamp: block.timestamp,
            location: location,
            dataHash: dataHash
        }));

        emit TraceEntryAdded(productId, msg.sender, action);
    }

    /**
     * @dev Recall product
     */
    function recallProduct(uint256 productId, string calldata reason) external onlyRole(INSPECTOR_ROLE) {
        Product storage product = products[productId];
        require(product.id != 0, "Not found");
        require(!product.recalled, "Already recalled");

        product.recalled = true;

        emit ProductRecalled(productId, reason);
    }

    // ============ Outbreak Functions ============

    /**
     * @dev Declare outbreak
     */
    function declareOutbreak(
        string calldata pathogen,
        string calldata region,
        uint256 severity,
        uint256[] calldata linkedProducts
    ) external onlyRole(INSPECTOR_ROLE) returns (uint256) {
        require(severity >= 1 && severity <= 10, "Invalid severity");

        outbreakCount++;
        uint256 outbreakId = outbreakCount;

        outbreaks[outbreakId] = OutbreakAlert({
            id: outbreakId,
            pathogen: pathogen,
            region: region,
            severity: severity,
            timestamp: block.timestamp,
            linkedProducts: linkedProducts,
            active: true
        });

        // Auto-recall linked products
        for (uint256 i = 0; i < linkedProducts.length; i++) {
            Product storage product = products[linkedProducts[i]];
            if (product.id != 0 && !product.recalled) {
                product.recalled = true;
                emit ProductRecalled(linkedProducts[i], pathogen);
            }
        }

        emit OutbreakDeclared(outbreakId, pathogen, region, severity);

        return outbreakId;
    }

    /**
     * @dev Resolve outbreak
     */
    function resolveOutbreak(uint256 outbreakId) external onlyRole(INSPECTOR_ROLE) {
        OutbreakAlert storage outbreak = outbreaks[outbreakId];
        require(outbreak.id != 0, "Not found");
        require(outbreak.active, "Already resolved");

        outbreak.active = false;

        emit OutbreakResolved(outbreakId);
    }

    // ============ Admin Functions ============

    function setFees(
        uint256 inspection,
        uint256 certification,
        uint256 traceability
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        inspectionFee = inspection;
        certificationFee = certification;
        traceabilityFee = traceability;
    }

    function setThresholds(uint256 high, uint256 critical) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(high < critical, "Invalid thresholds");
        highRiskThreshold = high;
        criticalRiskThreshold = critical;
    }

    function removeBlacklist(address producerAddr) external onlyRole(DEFAULT_ADMIN_ROLE) {
        producers[producerAddr].blacklisted = false;
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // ============ View Functions ============

    function getProducer(address addr) external view returns (Producer memory) {
        return producers[addr];
    }

    function getProduct(uint256 productId) external view returns (Product memory) {
        return products[productId];
    }

    function getProductTrace(uint256 productId) external view returns (TraceEntry[] memory) {
        return productTrace[productId];
    }

    function getInspection(uint256 inspectionId) external view returns (Inspection memory) {
        return inspections[inspectionId];
    }

    function getCertification(uint256 certId) external view returns (Certification memory) {
        return certifications[certId];
    }

    function getOutbreak(uint256 outbreakId) external view returns (OutbreakAlert memory) {
        return outbreaks[outbreakId];
    }
}
