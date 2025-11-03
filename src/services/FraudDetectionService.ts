import { 
  FraudReport, 
  SuspiciousActivity, 
  TicketVerification, 
  UserSuspension,
  CreateFraudReportInput,
  CreateSuspiciousActivityInput,
  CreateTicketVerificationInput,
  CreateUserSuspensionInput,
  TicketListing,
  User,
  VerificationFinding,
  DatabaseConnection
} from '../types';
import { FraudReportRepository } from '../models/FraudReportRepository';
import { SuspiciousActivityRepository } from '../models/SuspiciousActivityRepository';
import { TicketVerificationRepository } from '../models/TicketVerificationRepository';
import { UserSuspensionRepository } from '../models/UserSuspensionRepository';
import { TicketListingRepository } from '../models/TicketListingRepository';
import { UserRepository } from '../models/UserRepository';

export class FraudDetectionService {
  private fraudReportRepo: FraudReportRepository;
  private suspiciousActivityRepo: SuspiciousActivityRepository;
  private ticketVerificationRepo: TicketVerificationRepository;
  private userSuspensionRepo: UserSuspensionRepository;
  private ticketListingRepo: TicketListingRepository;
  private userRepo: UserRepository;

  constructor(connection: DatabaseConnection) {
    this.fraudReportRepo = new FraudReportRepository(connection);
    this.suspiciousActivityRepo = new SuspiciousActivityRepository(connection);
    this.ticketVerificationRepo = new TicketVerificationRepository(connection);
    this.userSuspensionRepo = new UserSuspensionRepository(connection);
    this.ticketListingRepo = new TicketListingRepository(connection);
    this.userRepo = new UserRepository(connection);
  }

  // Fraud Report Management
  async reportFraud(input: CreateFraudReportInput): Promise<FraudReport> {
    // Validate that the reporter exists and is not suspended
    const reporter = await this.userRepo.findById(input.reporterId);
    if (!reporter) {
      throw new Error('Reporter not found');
    }

    if (reporter.status === 'suspended' || reporter.status === 'banned') {
      throw new Error('Suspended or banned users cannot report fraud');
    }

    // Check if similar report already exists
    const existingReports = await this.findSimilarReports(input);
    if (existingReports.length > 0) {
      throw new Error('Similar fraud report already exists');
    }

    const report = await this.fraudReportRepo.create(input);

    // Auto-assign to available moderator if high priority
    if (input.type === 'fake_ticket' || input.type === 'payment_fraud') {
      await this.autoAssignReport(report.id);
    }

    return report;
  }

  async assignReportToModerator(reportId: string, moderatorId: string): Promise<boolean> {
    // Verify moderator exists and has appropriate role
    const moderator = await this.userRepo.findById(moderatorId);
    if (!moderator || (moderator.role !== 'moderator' && moderator.role !== 'admin')) {
      throw new Error('Invalid moderator');
    }

    return await this.fraudReportRepo.assignToModerator(reportId, moderatorId);
  }

  async resolveReport(reportId: string, resolution: string, resolvedBy: string): Promise<boolean> {
    const report = await this.fraudReportRepo.findById(reportId);
    if (!report) {
      throw new Error('Report not found');
    }

    const success = await this.fraudReportRepo.resolveReport(reportId, resolution, resolvedBy);

    if (success && report.reportedUserId) {
      // Check if user should be suspended based on resolved reports
      await this.evaluateUserForSuspension(report.reportedUserId);
    }

    return success;
  }

  // Suspicious Activity Detection
  async flagSuspiciousActivity(input: CreateSuspiciousActivityInput): Promise<SuspiciousActivity> {
    const activity = await this.suspiciousActivityRepo.create(input);

    // Auto-escalate critical activities
    if (input.severity === 'critical') {
      await this.escalateCriticalActivity(activity);
    }

    return activity;
  }

  async detectRapidListing(userId: string): Promise<void> {
    // Check for rapid listing creation (more than 10 listings in 1 hour)
    const recentListings = await this.ticketListingRepo.findBySellerId(userId);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    const rapidListings = recentListings.filter(listing => 
      listing.createdAt > oneHourAgo
    );

    if (rapidListings.length > 10) {
      await this.flagSuspiciousActivity({
        userId,
        activityType: 'rapid_listing',
        description: `User created ${rapidListings.length} listings in the past hour`,
        severity: 'high',
        metadata: {
          listingCount: rapidListings.length,
          timeframe: '1 hour',
          listingIds: rapidListings.map(l => l.id)
        }
      });
    }
  }

  async detectPriceManipulation(listingId: string): Promise<void> {
    const listing = await this.ticketListingRepo.findById(listingId);
    if (!listing) return;

    // Check if price is significantly higher than original price
    const priceRatio = listing.askingPrice / listing.originalPrice;
    
    if (priceRatio > 5) { // More than 5x original price
      await this.flagSuspiciousActivity({
        userId: listing.sellerId,
        activityType: 'price_manipulation',
        description: `Listing priced at ${priceRatio.toFixed(2)}x original price`,
        severity: 'medium',
        metadata: {
          listingId,
          originalPrice: listing.originalPrice,
          askingPrice: listing.askingPrice,
          priceRatio
        }
      });
    }
  }

  async detectDuplicateImages(listingId: string): Promise<void> {
    const listing = await this.ticketListingRepo.findById(listingId);
    if (!listing || listing.images.length === 0) return;

    // Find other listings with same images
    const allListings = await this.ticketListingRepo.findByStatus('active');
    const duplicateListings = allListings.filter(l => 
      l.id !== listingId && 
      l.images.some(img => listing.images.includes(img))
    );

    if (duplicateListings.length > 0) {
      await this.flagSuspiciousActivity({
        userId: listing.sellerId,
        activityType: 'duplicate_images',
        description: `Listing uses images found in ${duplicateListings.length} other listings`,
        severity: 'high',
        metadata: {
          listingId,
          duplicateListingIds: duplicateListings.map(l => l.id),
          duplicateImages: listing.images.filter(img => 
            duplicateListings.some(l => l.images.includes(img))
          )
        }
      });
    }
  }

  // Ticket Verification
  async verifyTicket(input: CreateTicketVerificationInput): Promise<TicketVerification> {
    const verification = await this.ticketVerificationRepo.create(input);

    // Auto-update listing verification status based on confidence
    if (input.confidence >= 90) {
      await this.ticketVerificationRepo.updateVerificationStatus(
        verification.id, 
        'verified'
      );
    } else if (input.confidence < 50) {
      await this.ticketVerificationRepo.updateVerificationStatus(
        verification.id, 
        'rejected'
      );
    } else {
      await this.ticketVerificationRepo.updateVerificationStatus(
        verification.id, 
        'requires_manual_review'
      );
    }

    return verification;
  }

  async performAutomatedVerification(listingId: string): Promise<TicketVerification> {
    const listing = await this.ticketListingRepo.findById(listingId);
    if (!listing) {
      throw new Error('Listing not found');
    }

    const findings: VerificationFinding[] = [];
    let confidence = 100;

    // Check basic format validation
    const formatFindings = await this.validateTicketFormat(listing);
    findings.push(...formatFindings);

    // Check for price anomalies
    const priceFindings = await this.validatePricing(listing);
    findings.push(...priceFindings);

    // Check venue information
    const venueFindings = await this.validateVenue(listing);
    findings.push(...venueFindings);

    // Calculate confidence based on findings
    confidence = this.calculateConfidence(findings);

    return await this.verifyTicket({
      listingId,
      verificationMethod: 'automated',
      findings,
      confidence
    });
  }

  async performManualReview(
    verificationId: string, 
    reviewedBy: string, 
    status: 'verified' | 'rejected',
    reviewNotes?: string
  ): Promise<boolean> {
    return await this.ticketVerificationRepo.updateVerificationStatus(
      verificationId,
      status,
      reviewedBy,
      reviewNotes
    );
  }

  // User Suspension Management
  async suspendUser(input: CreateUserSuspensionInput): Promise<UserSuspension> {
    // Check if user is already suspended
    const existingSuspension = await this.userSuspensionRepo.getActiveSuspensionForUser(input.userId);
    if (existingSuspension) {
      throw new Error('User is already suspended');
    }

    const suspension = await this.userSuspensionRepo.create(input);

    // Update user status
    await this.userRepo.update(input.userId, { status: 'suspended' });

    return suspension;
  }

  async liftSuspension(suspensionId: string): Promise<boolean> {
    const suspension = await this.userSuspensionRepo.findById(suspensionId);
    if (!suspension) {
      throw new Error('Suspension not found');
    }

    const success = await this.userSuspensionRepo.deactivateSuspension(suspensionId);

    if (success) {
      // Check if user has any other active suspensions
      const otherSuspensions = await this.userSuspensionRepo.findByUserId(suspension.userId);
      const hasActiveSuspensions = otherSuspensions.some(s => 
        s.id !== suspensionId && s.isActive
      );

      if (!hasActiveSuspensions) {
        await this.userRepo.update(suspension.userId, { status: 'active' });
      }
    }

    return success;
  }

  // Investigation Tools
  async getUserRiskProfile(userId: string): Promise<{
    user: User;
    riskScore: number;
    suspiciousActivities: SuspiciousActivity[];
    fraudReports: FraudReport[];
    suspensions: UserSuspension[];
    verificationHistory: TicketVerification[];
  }> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const riskData = await this.suspiciousActivityRepo.getUserRiskScore(userId);
    const suspiciousActivities = await this.suspiciousActivityRepo.findByUserId(userId);
    const fraudReports = await this.fraudReportRepo.findByReportedUserId(userId);
    const suspensions = await this.userSuspensionRepo.findByUserId(userId);
    
    // Get verification history for user's listings
    const userListings = await this.ticketListingRepo.findBySellerId(userId);
    const verificationHistory: TicketVerification[] = [];
    
    for (const listing of userListings) {
      const verifications = await this.ticketVerificationRepo.findByListingId(listing.id);
      verificationHistory.push(...verifications);
    }

    return {
      user,
      riskScore: riskData.riskScore,
      suspiciousActivities,
      fraudReports,
      suspensions,
      verificationHistory
    };
  }

  async getSystemStatistics(): Promise<{
    fraudReports: any;
    suspiciousActivities: any;
    verifications: any;
    suspensions: any;
  }> {
    const [fraudReports, suspiciousActivities, verifications, suspensions] = await Promise.all([
      this.fraudReportRepo.getReportStatistics(),
      this.suspiciousActivityRepo.getActivityStatistics(),
      this.ticketVerificationRepo.getVerificationStatistics(),
      this.userSuspensionRepo.getSuspensionStatistics()
    ]);

    return {
      fraudReports,
      suspiciousActivities,
      verifications,
      suspensions
    };
  }

  // Private helper methods
  private async findSimilarReports(input: CreateFraudReportInput): Promise<FraudReport[]> {
    const reports: FraudReport[] = [];

    if (input.reportedUserId) {
      const userReports = await this.fraudReportRepo.findByReportedUserId(input.reportedUserId);
      reports.push(...userReports.filter(r => 
        r.type === input.type && 
        r.status === 'pending' &&
        r.reporterId === input.reporterId
      ));
    }

    if (input.listingId) {
      const listingReports = await this.fraudReportRepo.findByListingId(input.listingId);
      reports.push(...listingReports.filter(r => 
        r.type === input.type && 
        r.status === 'pending' &&
        r.reporterId === input.reporterId
      ));
    }

    return reports;
  }

  private async autoAssignReport(reportId: string): Promise<void> {
    // Find available moderators (simplified - in real implementation, use load balancing)
    const moderators = await this.userRepo.findAll();
    const availableModerators = moderators.filter(u => 
      u.role === 'moderator' && u.status === 'active'
    );

    if (availableModerators.length > 0) {
      const moderator = availableModerators[0];
      if (moderator) {
        await this.fraudReportRepo.assignToModerator(reportId, moderator.id);
      }
    }
  }

  private async escalateCriticalActivity(activity: SuspiciousActivity): Promise<void> {
    // Auto-suspend users with critical activities
    if (activity.severity === 'critical') {
      try {
        await this.suspendUser({
          userId: activity.userId,
          reason: `Critical suspicious activity detected: ${activity.description}`,
          suspendedBy: 'system', // System user ID
          suspensionType: 'temporary',
          endDate: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
        });
      } catch (error) {
        // User might already be suspended, ignore error
      }
    }
  }

  private async evaluateUserForSuspension(userId: string): Promise<void> {
    const riskData = await this.suspiciousActivityRepo.getUserRiskScore(userId);
    const fraudReports = await this.fraudReportRepo.findByReportedUserId(userId);
    
    const resolvedReports = fraudReports.filter(r => r.status === 'resolved');
    
    // Suspend if risk score is high or multiple resolved fraud reports
    if (riskData.riskScore >= 80 || resolvedReports.length >= 3) {
      try {
        await this.suspendUser({
          userId,
          reason: `High risk score (${riskData.riskScore}) or multiple fraud reports (${resolvedReports.length})`,
          suspendedBy: 'system',
          suspensionType: 'temporary',
          endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
        });
      } catch (error) {
        // User might already be suspended
      }
    }
  }

  private async validateTicketFormat(listing: TicketListing): Promise<VerificationFinding[]> {
    const findings: VerificationFinding[] = [];

    // Check required fields
    if (!listing.eventName || listing.eventName.length < 3) {
      findings.push({
        type: 'format_invalid',
        severity: 'error',
        message: 'Event name is missing or too short',
        confidence: 90
      });
    }

    if (!listing.venue || listing.venue.length < 3) {
      findings.push({
        type: 'format_invalid',
        severity: 'error',
        message: 'Venue information is missing or incomplete',
        confidence: 85
      });
    }

    if (listing.eventDate < new Date()) {
      findings.push({
        type: 'format_invalid',
        severity: 'error',
        message: 'Event date is in the past',
        confidence: 100
      });
    }

    if (listing.images.length === 0) {
      findings.push({
        type: 'format_invalid',
        severity: 'warning',
        message: 'No ticket images provided',
        confidence: 70
      });
    }

    return findings;
  }

  private async validatePricing(listing: TicketListing): Promise<VerificationFinding[]> {
    const findings: VerificationFinding[] = [];
    const priceRatio = listing.askingPrice / listing.originalPrice;

    if (priceRatio > 10) {
      findings.push({
        type: 'price_anomaly',
        severity: 'error',
        message: `Asking price is ${priceRatio.toFixed(1)}x the original price`,
        confidence: 95,
        metadata: { priceRatio, originalPrice: listing.originalPrice, askingPrice: listing.askingPrice }
      });
    } else if (priceRatio > 3) {
      findings.push({
        type: 'price_anomaly',
        severity: 'warning',
        message: `Asking price is ${priceRatio.toFixed(1)}x the original price`,
        confidence: 70,
        metadata: { priceRatio, originalPrice: listing.originalPrice, askingPrice: listing.askingPrice }
      });
    }

    return findings;
  }

  private async validateVenue(listing: TicketListing): Promise<VerificationFinding[]> {
    const findings: VerificationFinding[] = [];

    // Simple venue validation (in real implementation, use venue database)
    const commonVenues = ['madison square garden', 'staples center', 'wembley stadium'];
    const venueMatch = commonVenues.some(venue => 
      listing.venue.toLowerCase().includes(venue)
    );

    if (!venueMatch && listing.category !== 'transportation') {
      findings.push({
        type: 'venue_mismatch',
        severity: 'info',
        message: 'Venue not found in common venues database',
        confidence: 30
      });
    }

    return findings;
  }

  private calculateConfidence(findings: VerificationFinding[]): number {
    let confidence = 100;

    for (const finding of findings) {
      if (finding.severity === 'error') {
        confidence -= 30;
      } else if (finding.severity === 'warning') {
        confidence -= 15;
      } else if (finding.severity === 'info') {
        confidence -= 5;
      }
    }

    return Math.max(0, Math.min(100, confidence));
  }
}