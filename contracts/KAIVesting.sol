// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title KAI Token Vesting Contract
 * @author KAI Intelligence
 * @notice Manages token vesting schedules for team, founders, and advisors
 * @dev Implements linear vesting with cliff period
 *
 * Features:
 * - Multiple beneficiaries with individual schedules
 * - Cliff period before any tokens vest
 * - Linear vesting after cliff
 * - Revocable schedules (for employees who leave)
 * - Emergency withdrawal by owner
 *
 * Typical schedules:
 * - Founders: 4-year vesting, 1-year cliff
 * - Team: 3-year vesting, 6-month cliff
 * - Advisors: 2-year vesting, 3-month cliff
 */
contract KAIVesting is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============================================
    // STRUCTS
    // ============================================

    struct VestingSchedule {
        address beneficiary;
        uint256 totalAmount;        // Total tokens to vest
        uint256 releasedAmount;     // Tokens already released
        uint256 startTime;          // Vesting start timestamp
        uint256 cliffDuration;      // Cliff period in seconds
        uint256 vestingDuration;    // Total vesting period in seconds
        bool revocable;             // Can be revoked by owner
        bool revoked;               // Has been revoked
        string vestingType;         // "founder", "team", "advisor", "investor"
    }

    // ============================================
    // STATE VARIABLES
    // ============================================

    IERC20 public immutable kaiToken;

    // Vesting schedule ID counter
    uint256 public scheduleCount;

    // Schedule ID => VestingSchedule
    mapping(uint256 => VestingSchedule) public schedules;

    // Beneficiary => array of their schedule IDs
    mapping(address => uint256[]) public beneficiarySchedules;

    // Total tokens locked in vesting
    uint256 public totalVested;

    // Total tokens released
    uint256 public totalReleased;

    // ============================================
    // EVENTS
    // ============================================

    event VestingScheduleCreated(
        uint256 indexed scheduleId,
        address indexed beneficiary,
        uint256 amount,
        uint256 cliffDuration,
        uint256 vestingDuration,
        string vestingType
    );

    event TokensReleased(
        uint256 indexed scheduleId,
        address indexed beneficiary,
        uint256 amount
    );

    event VestingRevoked(
        uint256 indexed scheduleId,
        address indexed beneficiary,
        uint256 amountRefunded
    );

    event EmergencyWithdraw(
        address indexed token,
        address indexed to,
        uint256 amount
    );

    // ============================================
    // CONSTRUCTOR
    // ============================================

    constructor(address _kaiToken) Ownable(msg.sender) {
        require(_kaiToken != address(0), "Invalid token address");
        kaiToken = IERC20(_kaiToken);
    }

    // ============================================
    // VESTING CREATION
    // ============================================

    /**
     * @notice Create a new vesting schedule
     * @param beneficiary Address who receives vested tokens
     * @param amount Total tokens to vest
     * @param cliffDuration Cliff period in seconds (0 for no cliff)
     * @param vestingDuration Total vesting duration in seconds
     * @param revocable Whether schedule can be revoked
     * @param vestingType Category string (founder, team, advisor, investor)
     */
    function createVestingSchedule(
        address beneficiary,
        uint256 amount,
        uint256 cliffDuration,
        uint256 vestingDuration,
        bool revocable,
        string calldata vestingType
    ) external onlyOwner returns (uint256 scheduleId) {
        require(beneficiary != address(0), "Invalid beneficiary");
        require(amount > 0, "Amount must be > 0");
        require(vestingDuration > 0, "Vesting duration must be > 0");
        require(cliffDuration <= vestingDuration, "Cliff > vesting duration");

        // Transfer tokens to this contract
        kaiToken.safeTransferFrom(msg.sender, address(this), amount);

        scheduleId = scheduleCount++;

        schedules[scheduleId] = VestingSchedule({
            beneficiary: beneficiary,
            totalAmount: amount,
            releasedAmount: 0,
            startTime: block.timestamp,
            cliffDuration: cliffDuration,
            vestingDuration: vestingDuration,
            revocable: revocable,
            revoked: false,
            vestingType: vestingType
        });

        beneficiarySchedules[beneficiary].push(scheduleId);
        totalVested += amount;

        emit VestingScheduleCreated(
            scheduleId,
            beneficiary,
            amount,
            cliffDuration,
            vestingDuration,
            vestingType
        );
    }

    /**
     * @notice Create founder vesting (4 years, 1 year cliff)
     */
    function createFounderVesting(
        address beneficiary,
        uint256 amount
    ) external onlyOwner returns (uint256) {
        return this.createVestingSchedule(
            beneficiary,
            amount,
            365 days,   // 1 year cliff
            4 * 365 days, // 4 year vesting
            true,       // Revocable
            "founder"
        );
    }

    /**
     * @notice Create team member vesting (3 years, 6 month cliff)
     */
    function createTeamVesting(
        address beneficiary,
        uint256 amount
    ) external onlyOwner returns (uint256) {
        return this.createVestingSchedule(
            beneficiary,
            amount,
            180 days,   // 6 month cliff
            3 * 365 days, // 3 year vesting
            true,       // Revocable
            "team"
        );
    }

    /**
     * @notice Create advisor vesting (2 years, 3 month cliff)
     */
    function createAdvisorVesting(
        address beneficiary,
        uint256 amount
    ) external onlyOwner returns (uint256) {
        return this.createVestingSchedule(
            beneficiary,
            amount,
            90 days,    // 3 month cliff
            2 * 365 days, // 2 year vesting
            true,       // Revocable
            "advisor"
        );
    }

    /**
     * @notice Create investor vesting (1 year, no cliff)
     */
    function createInvestorVesting(
        address beneficiary,
        uint256 amount
    ) external onlyOwner returns (uint256) {
        return this.createVestingSchedule(
            beneficiary,
            amount,
            0,          // No cliff
            365 days,   // 1 year vesting
            false,      // Not revocable
            "investor"
        );
    }

    // ============================================
    // VESTING RELEASE
    // ============================================

    /**
     * @notice Release vested tokens for a specific schedule
     * @param scheduleId ID of the vesting schedule
     */
    function release(uint256 scheduleId) external nonReentrant {
        VestingSchedule storage schedule = schedules[scheduleId];

        require(!schedule.revoked, "Schedule revoked");
        require(
            msg.sender == schedule.beneficiary || msg.sender == owner(),
            "Not authorized"
        );

        uint256 releasable = computeReleasableAmount(scheduleId);
        require(releasable > 0, "No tokens to release");

        schedule.releasedAmount += releasable;
        totalReleased += releasable;

        kaiToken.safeTransfer(schedule.beneficiary, releasable);

        emit TokensReleased(scheduleId, schedule.beneficiary, releasable);
    }

    /**
     * @notice Release all vested tokens for a beneficiary
     * @param beneficiary Address to release tokens for
     */
    function releaseAll(address beneficiary) external nonReentrant {
        uint256[] storage scheduleIds = beneficiarySchedules[beneficiary];
        require(scheduleIds.length > 0, "No schedules found");

        uint256 totalReleasable = 0;

        for (uint256 i = 0; i < scheduleIds.length; i++) {
            uint256 scheduleId = scheduleIds[i];
            VestingSchedule storage schedule = schedules[scheduleId];

            if (!schedule.revoked) {
                uint256 releasable = computeReleasableAmount(scheduleId);
                if (releasable > 0) {
                    schedule.releasedAmount += releasable;
                    totalReleasable += releasable;

                    emit TokensReleased(scheduleId, beneficiary, releasable);
                }
            }
        }

        require(totalReleasable > 0, "No tokens to release");
        totalReleased += totalReleasable;

        kaiToken.safeTransfer(beneficiary, totalReleasable);
    }

    // ============================================
    // VESTING CALCULATIONS
    // ============================================

    /**
     * @notice Compute releasable amount for a schedule
     * @param scheduleId ID of the vesting schedule
     * @return releasable Amount of tokens that can be released
     */
    function computeReleasableAmount(uint256 scheduleId) public view returns (uint256 releasable) {
        VestingSchedule storage schedule = schedules[scheduleId];

        if (schedule.revoked) {
            return 0;
        }

        uint256 vested = computeVestedAmount(scheduleId);
        releasable = vested - schedule.releasedAmount;
    }

    /**
     * @notice Compute total vested amount for a schedule
     * @param scheduleId ID of the vesting schedule
     * @return vested Total vested amount
     */
    function computeVestedAmount(uint256 scheduleId) public view returns (uint256 vested) {
        VestingSchedule storage schedule = schedules[scheduleId];

        if (schedule.revoked) {
            return schedule.releasedAmount;
        }

        uint256 elapsed = block.timestamp - schedule.startTime;

        // Before cliff: nothing vested
        if (elapsed < schedule.cliffDuration) {
            return 0;
        }

        // After full vesting: everything vested
        if (elapsed >= schedule.vestingDuration) {
            return schedule.totalAmount;
        }

        // Linear vesting between cliff and end
        vested = (schedule.totalAmount * elapsed) / schedule.vestingDuration;
    }

    /**
     * @notice Get total releasable amount for a beneficiary
     * @param beneficiary Address to check
     * @return total Total releasable tokens
     */
    function getReleasableAmount(address beneficiary) external view returns (uint256 total) {
        uint256[] storage scheduleIds = beneficiarySchedules[beneficiary];

        for (uint256 i = 0; i < scheduleIds.length; i++) {
            total += computeReleasableAmount(scheduleIds[i]);
        }
    }

    /**
     * @notice Get total vested amount for a beneficiary
     * @param beneficiary Address to check
     * @return total Total vested tokens
     */
    function getVestedAmount(address beneficiary) external view returns (uint256 total) {
        uint256[] storage scheduleIds = beneficiarySchedules[beneficiary];

        for (uint256 i = 0; i < scheduleIds.length; i++) {
            total += computeVestedAmount(scheduleIds[i]);
        }
    }

    // ============================================
    // REVOCATION
    // ============================================

    /**
     * @notice Revoke a vesting schedule
     * @param scheduleId ID of the schedule to revoke
     * @dev Only works for revocable schedules
     */
    function revoke(uint256 scheduleId) external onlyOwner {
        VestingSchedule storage schedule = schedules[scheduleId];

        require(schedule.revocable, "Not revocable");
        require(!schedule.revoked, "Already revoked");

        // Release any vested amount first
        uint256 vested = computeVestedAmount(scheduleId);
        uint256 unreleased = vested - schedule.releasedAmount;

        if (unreleased > 0) {
            schedule.releasedAmount = vested;
            totalReleased += unreleased;
            kaiToken.safeTransfer(schedule.beneficiary, unreleased);
            emit TokensReleased(scheduleId, schedule.beneficiary, unreleased);
        }

        // Refund unvested tokens to owner
        uint256 refundable = schedule.totalAmount - vested;

        schedule.revoked = true;
        totalVested -= refundable;

        if (refundable > 0) {
            kaiToken.safeTransfer(owner(), refundable);
        }

        emit VestingRevoked(scheduleId, schedule.beneficiary, refundable);
    }

    // ============================================
    // VIEW FUNCTIONS
    // ============================================

    /**
     * @notice Get vesting schedule details
     * @param scheduleId ID of the schedule
     */
    function getSchedule(uint256 scheduleId) external view returns (
        address beneficiary,
        uint256 totalAmount,
        uint256 releasedAmount,
        uint256 startTime,
        uint256 cliffDuration,
        uint256 vestingDuration,
        bool revocable,
        bool revoked,
        string memory vestingType
    ) {
        VestingSchedule storage s = schedules[scheduleId];
        return (
            s.beneficiary,
            s.totalAmount,
            s.releasedAmount,
            s.startTime,
            s.cliffDuration,
            s.vestingDuration,
            s.revocable,
            s.revoked,
            s.vestingType
        );
    }

    /**
     * @notice Get all schedule IDs for a beneficiary
     * @param beneficiary Address to check
     */
    function getScheduleIds(address beneficiary) external view returns (uint256[] memory) {
        return beneficiarySchedules[beneficiary];
    }

    /**
     * @notice Get number of schedules for a beneficiary
     */
    function getScheduleCount(address beneficiary) external view returns (uint256) {
        return beneficiarySchedules[beneficiary].length;
    }

    /**
     * @notice Get contract statistics
     */
    function getStats() external view returns (
        uint256 _totalVested,
        uint256 _totalReleased,
        uint256 _scheduleCount,
        uint256 _balance
    ) {
        return (
            totalVested,
            totalReleased,
            scheduleCount,
            kaiToken.balanceOf(address(this))
        );
    }

    // ============================================
    // EMERGENCY
    // ============================================

    /**
     * @notice Emergency withdrawal of stuck tokens
     * @param token Token address (use address(0) for ETH)
     * @param to Recipient address
     * @param amount Amount to withdraw
     */
    function emergencyWithdraw(
        address token,
        address to,
        uint256 amount
    ) external onlyOwner {
        require(to != address(0), "Invalid recipient");

        if (token == address(0)) {
            // Withdraw ETH
            (bool success, ) = to.call{value: amount}("");
            require(success, "ETH transfer failed");
        } else {
            // Withdraw ERC20
            IERC20(token).safeTransfer(to, amount);
        }

        emit EmergencyWithdraw(token, to, amount);
    }

    /**
     * @notice Receive ETH
     */
    receive() external payable {}
}
