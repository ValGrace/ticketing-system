import { Request, Response } from 'express';
import { FraudDetectionService } from '../services/FraudDetectionService';
import { DatabaseConnection } from '../types';

export class FraudDetectionController {
  private fraudDetectionService: FraudDetectionService;

  constructor(connection: DatabaseConnection) {
    this.fraudDetectionService = new FraudDetectionService(connection);
  }

  // Fraud Report endpoints
  reportFraud = async (req: Request, res: Response): Promise<void> => {
    try {
      const { reportedUserId, listingId, transactionId, type, reason, description, evidence } = req.body;
      const reporterId = req.user?.userId;

      if (!reporterId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const report = await this.fraudDetectionService.reportFraud({
        reporterId,
        reportedUserId,
        listingId,
        transactionId,
        type,
        reason,
        description,
        evidence
      });

      res.status(201).json(report);
    } catch (error) {
      console.error('Error reporting fraud:', error);
      res.status(400).json({ 
        error: error instanceof Error ? error.message : 'Failed to report fraud' 
      });
    }
  };

  getFraudReports = async (req: Request, res: Response): Promise<void> => {
    try {
      const { status, assignedTo, reportedUserId } = req.query;
      const userRole = req.user?.role;

      // Only moderators and admins can view fraud reports
      if (userRole !== 'moderator' && userRole !== 'admin') {
        res.status(403).json({ error: 'Insufficient permissions' });
        return;
      }

      let reports;
      if (status) {
        reports = await this.fraudDetectionService['fraudReportRepo'].findByStatus(status as any);
      } else if (assignedTo) {
        reports = await this.fraudDetectionService['fraudReportRepo'].findByAssignedTo(assignedTo as string);
      } else if (reportedUserId) {
        reports = await this.fraudDetectionService['fraudReportRepo'].findByReportedUserId(reportedUserId as string);
      } else {
        reports = await this.fraudDetectionService['fraudReportRepo'].findAll();
      }

      res.json(reports);
    } catch (error) {
      console.error('Error fetching fraud reports:', error);
      res.status(500).json({ error: 'Failed to fetch fraud reports' });
    }
  };

  assignReport = async (req: Request, res: Response): Promise<void> => {
    try {
      const { reportId } = req.params;
      const { moderatorId } = req.body;
      const userRole = req.user?.role;

      if (userRole !== 'admin') {
        res.status(403).json({ error: 'Only admins can assign reports' });
        return;
      }

      if (!moderatorId) {
        res.status(400).json({ error: 'Moderator ID is required' });
        return;
      }

      if (!reportId) {
        res.status(400).json({ error: 'Report ID is required' });
        return;
      }

      const success = await this.fraudDetectionService.assignReportToModerator(reportId, moderatorId);
      
      if (success) {
        res.json({ message: 'Report assigned successfully' });
      } else {
        res.status(400).json({ error: 'Failed to assign report' });
      }
    } catch (error) {
      console.error('Error assigning report:', error);
      res.status(400).json({ 
        error: error instanceof Error ? error.message : 'Failed to assign report' 
      });
    }
  };

  resolveReport = async (req: Request, res: Response): Promise<void> => {
    try {
      const { reportId } = req.params;
      const { resolution } = req.body;
      const resolvedBy = req.user?.userId;
      const userRole = req.user?.role;

      if (userRole !== 'moderator' && userRole !== 'admin') {
        res.status(403).json({ error: 'Insufficient permissions' });
        return;
      }

      if (!resolvedBy) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      if (!reportId || !resolution) {
        res.status(400).json({ error: 'Report ID and resolution are required' });
        return;
      }

      const success = await this.fraudDetectionService.resolveReport(reportId, resolution, resolvedBy);
      
      if (success) {
        res.json({ message: 'Report resolved successfully' });
      } else {
        res.status(400).json({ error: 'Failed to resolve report' });
      }
    } catch (error) {
      console.error('Error resolving report:', error);
      res.status(400).json({ 
        error: error instanceof Error ? error.message : 'Failed to resolve report' 
      });
    }
  };

  // Suspicious Activity endpoints
  getSuspiciousActivities = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId, severity, status, type } = req.query;
      const userRole = req.user?.role;

      if (userRole !== 'moderator' && userRole !== 'admin') {
        res.status(403).json({ error: 'Insufficient permissions' });
        return;
      }

      let activities;
      if (userId) {
        activities = await this.fraudDetectionService['suspiciousActivityRepo'].findByUserId(userId as string);
      } else if (severity) {
        activities = await this.fraudDetectionService['suspiciousActivityRepo'].findBySeverity(severity as any);
      } else if (status) {
        activities = await this.fraudDetectionService['suspiciousActivityRepo'].findByStatus(status as any);
      } else if (type) {
        activities = await this.fraudDetectionService['suspiciousActivityRepo'].findByActivityType(type as any);
      } else {
        activities = await this.fraudDetectionService['suspiciousActivityRepo'].findHighPriorityActivities();
      }

      res.json(activities);
    } catch (error) {
      console.error('Error fetching suspicious activities:', error);
      res.status(500).json({ error: 'Failed to fetch suspicious activities' });
    }
  };

  reviewActivity = async (req: Request, res: Response): Promise<void> => {
    try {
      const { activityId } = req.params;
      const { status, notes } = req.body;
      const reviewedBy = req.user?.userId;
      const userRole = req.user?.role;

      if (userRole !== 'moderator' && userRole !== 'admin') {
        res.status(403).json({ error: 'Insufficient permissions' });
        return;
      }

      if (!reviewedBy) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      if (!activityId) {
        res.status(400).json({ error: 'Activity ID is required' });
        return;
      }

      const success = await this.fraudDetectionService['suspiciousActivityRepo'].reviewActivity(
        activityId, 
        reviewedBy, 
        status, 
        notes
      );
      
      if (success) {
        res.json({ message: 'Activity reviewed successfully' });
      } else {
        res.status(400).json({ error: 'Failed to review activity' });
      }
    } catch (error) {
      console.error('Error reviewing activity:', error);
      res.status(400).json({ 
        error: error instanceof Error ? error.message : 'Failed to review activity' 
      });
    }
  };

  // Ticket Verification endpoints
  verifyTicket = async (req: Request, res: Response): Promise<void> => {
    try {
      const { listingId } = req.params;
      const userRole = req.user?.role;

      if (userRole !== 'moderator' && userRole !== 'admin') {
        res.status(403).json({ error: 'Insufficient permissions' });
        return;
      }

      if (!listingId) {
        res.status(400).json({ error: 'Listing ID is required' });
        return;
      }

      const verification = await this.fraudDetectionService.performAutomatedVerification(listingId);
      res.json(verification);
    } catch (error) {
      console.error('Error verifying ticket:', error);
      res.status(400).json({ 
        error: error instanceof Error ? error.message : 'Failed to verify ticket' 
      });
    }
  };

  getVerifications = async (req: Request, res: Response): Promise<void> => {
    try {
      const { listingId, status, method } = req.query;
      const userRole = req.user?.role;

      if (userRole !== 'moderator' && userRole !== 'admin') {
        res.status(403).json({ error: 'Insufficient permissions' });
        return;
      }

      let verifications;
      if (listingId) {
        verifications = await this.fraudDetectionService['ticketVerificationRepo'].findByListingId(listingId as string);
      } else if (status) {
        verifications = await this.fraudDetectionService['ticketVerificationRepo'].findByStatus(status as any);
      } else if (method) {
        verifications = await this.fraudDetectionService['ticketVerificationRepo'].findByMethod(method as any);
      } else {
        verifications = await this.fraudDetectionService['ticketVerificationRepo'].findPendingManualReviews();
      }

      res.json(verifications);
    } catch (error) {
      console.error('Error fetching verifications:', error);
      res.status(500).json({ error: 'Failed to fetch verifications' });
    }
  };

  manualReview = async (req: Request, res: Response): Promise<void> => {
    try {
      const { verificationId } = req.params;
      const { status, reviewNotes } = req.body;
      const reviewedBy = req.user?.userId;
      const userRole = req.user?.role;

      if (userRole !== 'moderator' && userRole !== 'admin') {
        res.status(403).json({ error: 'Insufficient permissions' });
        return;
      }

      if (!reviewedBy) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      if (!verificationId) {
        res.status(400).json({ error: 'Verification ID is required' });
        return;
      }

      const success = await this.fraudDetectionService.performManualReview(
        verificationId, 
        reviewedBy, 
        status, 
        reviewNotes
      );
      
      if (success) {
        res.json({ message: 'Manual review completed successfully' });
      } else {
        res.status(400).json({ error: 'Failed to complete manual review' });
      }
    } catch (error) {
      console.error('Error performing manual review:', error);
      res.status(400).json({ 
        error: error instanceof Error ? error.message : 'Failed to perform manual review' 
      });
    }
  };

  // User Suspension endpoints
  suspendUser = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId, reason, suspensionType, endDate } = req.body;
      const suspendedBy = req.user?.userId;
      const userRole = req.user?.role;

      if (userRole !== 'admin') {
        res.status(403).json({ error: 'Only admins can suspend users' });
        return;
      }

      if (!suspendedBy) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const suspensionInput = {
        userId,
        reason,
        suspendedBy,
        suspensionType,
        ...(endDate && { endDate: new Date(endDate) })
      };

      const suspension = await this.fraudDetectionService.suspendUser(suspensionInput);

      res.status(201).json(suspension);
    } catch (error) {
      console.error('Error suspending user:', error);
      res.status(400).json({ 
        error: error instanceof Error ? error.message : 'Failed to suspend user' 
      });
    }
  };

  liftSuspension = async (req: Request, res: Response): Promise<void> => {
    try {
      const { suspensionId } = req.params;
      const userRole = req.user?.role;

      if (userRole !== 'admin') {
        res.status(403).json({ error: 'Only admins can lift suspensions' });
        return;
      }

      if (!suspensionId) {
        res.status(400).json({ error: 'Suspension ID is required' });
        return;
      }

      const success = await this.fraudDetectionService.liftSuspension(suspensionId);
      
      if (success) {
        res.json({ message: 'Suspension lifted successfully' });
      } else {
        res.status(400).json({ error: 'Failed to lift suspension' });
      }
    } catch (error) {
      console.error('Error lifting suspension:', error);
      res.status(400).json({ 
        error: error instanceof Error ? error.message : 'Failed to lift suspension' 
      });
    }
  };

  getSuspensions = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId, active } = req.query;
      const userRole = req.user?.role;

      if (userRole !== 'moderator' && userRole !== 'admin') {
        res.status(403).json({ error: 'Insufficient permissions' });
        return;
      }

      let suspensions;
      if (userId) {
        suspensions = await this.fraudDetectionService['userSuspensionRepo'].findByUserId(userId as string);
      } else if (active === 'true') {
        suspensions = await this.fraudDetectionService['userSuspensionRepo'].findActiveSuspensions();
      } else {
        suspensions = await this.fraudDetectionService['userSuspensionRepo'].findAll();
      }

      res.json(suspensions);
    } catch (error) {
      console.error('Error fetching suspensions:', error);
      res.status(500).json({ error: 'Failed to fetch suspensions' });
    }
  };

  // Investigation endpoints
  getUserRiskProfile = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      const userRole = req.user?.role;

      if (userRole !== 'moderator' && userRole !== 'admin') {
        res.status(403).json({ error: 'Insufficient permissions' });
        return;
      }

      if (!userId) {
        res.status(400).json({ error: 'User ID is required' });
        return;
      }

      const riskProfile = await this.fraudDetectionService.getUserRiskProfile(userId);
      res.json(riskProfile);
    } catch (error) {
      console.error('Error fetching user risk profile:', error);
      res.status(400).json({ 
        error: error instanceof Error ? error.message : 'Failed to fetch user risk profile' 
      });
    }
  };

  getSystemStatistics = async (req: Request, res: Response): Promise<void> => {
    try {
      const userRole = req.user?.role;

      if (userRole !== 'admin') {
        res.status(403).json({ error: 'Only admins can view system statistics' });
        return;
      }

      const statistics = await this.fraudDetectionService.getSystemStatistics();
      res.json(statistics);
    } catch (error) {
      console.error('Error fetching system statistics:', error);
      res.status(500).json({ error: 'Failed to fetch system statistics' });
    }
  };

  // Automated detection triggers
  triggerRapidListingCheck = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      
      if (!userId) {
        res.status(400).json({ error: 'User ID is required' });
        return;
      }
      
      await this.fraudDetectionService.detectRapidListing(userId);
      res.json({ message: 'Rapid listing check completed' });
    } catch (error) {
      console.error('Error checking rapid listing:', error);
      res.status(500).json({ error: 'Failed to check rapid listing' });
    }
  };

  triggerPriceManipulationCheck = async (req: Request, res: Response): Promise<void> => {
    try {
      const { listingId } = req.params;
      
      if (!listingId) {
        res.status(400).json({ error: 'Listing ID is required' });
        return;
      }
      
      await this.fraudDetectionService.detectPriceManipulation(listingId);
      res.json({ message: 'Price manipulation check completed' });
    } catch (error) {
      console.error('Error checking price manipulation:', error);
      res.status(500).json({ error: 'Failed to check price manipulation' });
    }
  };

  triggerDuplicateImageCheck = async (req: Request, res: Response): Promise<void> => {
    try {
      const { listingId } = req.params;
      
      if (!listingId) {
        res.status(400).json({ error: 'Listing ID is required' });
        return;
      }
      
      await this.fraudDetectionService.detectDuplicateImages(listingId);
      res.json({ message: 'Duplicate image check completed' });
    } catch (error) {
      console.error('Error checking duplicate images:', error);
      res.status(500).json({ error: 'Failed to check duplicate images' });
    }
  };
}