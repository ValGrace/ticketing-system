import { FraudDetectionService } from '../FraudDetectionService';
import { DatabaseConnection } from '../../types';

// Mock all the repository modules
jest.mock('../../models/FraudReportRepository');
jest.mock('../../models/SuspiciousActivityRepository');
jest.mock('../../models/TicketVerificationRepository');
jest.mock('../../models/UserSuspensionRepository');
jest.mock('../../models/TicketListingRepository');
jest.mock('../../models/UserRepository');

describe('FraudDetectionService', () => {
    let service: FraudDetectionService;
    let mockConnection: jest.Mocked<DatabaseConnection>;

    beforeEach(() => {
        mockConnection = {
            query: jest.fn(),
            transaction: jest.fn(),
            close: jest.fn()
        } as jest.Mocked<DatabaseConnection>;

        service = new FraudDetectionService(mockConnection);
    });

    it('should initialize successfully', () => {
        expect(service).toBeDefined();
        expect(service).toBeInstanceOf(FraudDetectionService);
    });

    it('should have all required methods', () => {
        expect(typeof service.reportFraud).toBe('function');
        expect(typeof service.detectRapidListing).toBe('function');
        expect(typeof service.detectPriceManipulation).toBe('function');
        expect(typeof service.detectDuplicateImages).toBe('function');
        expect(typeof service.performAutomatedVerification).toBe('function');
        expect(typeof service.suspendUser).toBe('function');
        expect(typeof service.getUserRiskProfile).toBe('function');
        expect(typeof service.getSystemStatistics).toBe('function');
    });
});