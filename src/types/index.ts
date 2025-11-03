// Core data model interfaces for the ticket resell platform

export interface User {
  id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  phoneNumber?: string;
  profileImage?: string;
  isVerified: boolean;
  rating: number;
  totalTransactions: number;
  role: 'user' | 'admin' | 'moderator';
  createdAt: Date;
  updatedAt: Date;
  status: 'active' | 'suspended' | 'banned';
}

export interface TicketListing {
  id: string;
  sellerId: string;
  title: string;
  description: string;
  category: 'concert' | 'sports' | 'theater' | 'transportation' | 'other';
  eventName: string;
  eventDate: Date;
  eventTime: string;
  venue: string;
  seatSection?: string;
  seatRow?: string;
  seatNumber?: string;
  quantity: number;
  originalPrice: number;
  askingPrice: number;
  images: string[];
  status: 'active' | 'sold' | 'expired' | 'suspended';
  verificationStatus: 'pending' | 'verified' | 'rejected';
  createdAt: Date;
  updatedAt: Date;
  location: {
    city: string;
    state: string;
    country: string;
    coordinates?: [number, number];
  };
}

export interface Transaction {
  id: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  quantity: number;
  totalAmount: number;
  platformFee: number;
  paymentIntentId: string;
  status: 'pending' | 'paid' | 'confirmed' | 'disputed' | 'completed' | 'cancelled';
  escrowReleaseDate: Date;
  createdAt: Date;
  updatedAt: Date;
  disputeReason?: string;
  resolutionNotes?: string;
}

export interface Review {
  id: string;
  transactionId: string;
  reviewerId: string;
  revieweeId: string;
  rating: number; // 1-5 stars
  comment?: string;
  type: 'buyer_to_seller' | 'seller_to_buyer';
  createdAt: Date;
  isVisible: boolean;
}

// Database entity interfaces (for internal use with repositories)
export interface UserEntity {
  id: string;
  email: string;
  username: string;
  first_name: string;
  last_name: string;
  password_hash: string;
  phone_number?: string;
  profile_image?: string;
  is_verified: boolean;
  rating: number;
  total_transactions: number;
  role: 'user' | 'admin' | 'moderator';
  status: 'active' | 'suspended' | 'banned';
  created_at: string;
  updated_at: string;
}

export interface TicketListingEntity {
  id: string;
  seller_id: string;
  title: string;
  description: string;
  category: 'concert' | 'sports' | 'theater' | 'transportation' | 'other';
  event_name: string;
  event_date: string;
  event_time: string;
  venue: string;
  seat_section?: string;
  seat_row?: string;
  seat_number?: string;
  quantity: number;
  original_price: number;
  asking_price: number;
  images: string[];
  status: 'active' | 'sold' | 'expired' | 'suspended';
  verification_status: 'pending' | 'verified' | 'rejected';
  location_city: string;
  location_state: string;
  location_country: string;
  location_coordinates?: string;
  created_at: string;
  updated_at: string;
}

export interface TransactionEntity {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  quantity: number;
  total_amount: number;
  platform_fee: number;
  payment_intent_id: string;
  status: 'pending' | 'paid' | 'confirmed' | 'disputed' | 'completed' | 'cancelled';
  escrow_release_date: string;
  dispute_reason?: string;
  resolution_notes?: string;
  created_at: string;
  updated_at: string;
}

export interface ReviewEntity {
  id: string;
  transaction_id: string;
  reviewer_id: string;
  reviewee_id: string;
  rating: number;
  comment?: string;
  type: 'buyer_to_seller' | 'seller_to_buyer';
  is_visible: boolean;
  created_at: string;
}

// Input/Output DTOs
export interface CreateUserInput {
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  password: string;
  phoneNumber?: string;
}

export interface CreateListingInput {
  sellerId: string;
  title: string;
  description: string;
  category: TicketListing['category'];
  eventName: string;
  eventDate: Date;
  eventTime: string;
  venue: string;
  seatSection?: string;
  seatRow?: string;
  seatNumber?: string;
  quantity: number;
  originalPrice: number;
  askingPrice: number;
  location: TicketListing['location'];
}

export interface CreateTransactionInput {
  listingId: string;
  buyerId: string;
  sellerId: string;
  quantity: number;
  totalAmount: number;
  platformFee: number;
}

export interface CreateReviewInput {
  transactionId: string;
  reviewerId: string;
  revieweeId: string;
  rating: number;
  comment?: string;
  type: Review['type'];
}

// Repository interfaces
export interface BaseRepository<T, _TEntity, TCreateInput> {
  findById(id: string): Promise<T | null>;
  findAll(limit?: number, offset?: number): Promise<T[]>;
  create(input: TCreateInput): Promise<T>;
  update(id: string, updates: Partial<T>): Promise<T | null>;
  delete(id: string): Promise<boolean>;
}

export interface UserRepository extends BaseRepository<User, UserEntity, CreateUserInput> {
  findByEmail(email: string): Promise<User | null>;
  findByUsername(username: string): Promise<User | null>;
  updateRating(id: string, newRating: number): Promise<void>;
  incrementTransactionCount(id: string): Promise<void>;
  validatePassword(userId: string, password: string): Promise<boolean>;
  updatePassword(userId: string, newPassword: string): Promise<boolean>;
}

export interface TicketListingRepository extends BaseRepository<TicketListing, TicketListingEntity, CreateListingInput> {
  findBySellerId(sellerId: string): Promise<TicketListing[]>;
  findByCategory(category: TicketListing['category']): Promise<TicketListing[]>;
  findByStatus(status: TicketListing['status']): Promise<TicketListing[]>;
  search(filters: SearchFilters): Promise<TicketListing[]>;
  updateImages(id: string, images: string[]): Promise<boolean>;
  markAsExpired(id: string): Promise<boolean>;
  findExpiredListings(): Promise<TicketListing[]>;
  updateVerificationStatus(id: string, status: TicketListing['verificationStatus']): Promise<boolean>;
  findNearby(latitude: number, longitude: number, radiusKm?: number): Promise<TicketListing[]>;
}

export interface TransactionRepository extends BaseRepository<Transaction, TransactionEntity, CreateTransactionInput> {
  findByBuyerId(buyerId: string): Promise<Transaction[]>;
  findBySellerId(sellerId: string): Promise<Transaction[]>;
  findByListingId(listingId: string): Promise<Transaction[]>;
  findByStatus(status: Transaction['status']): Promise<Transaction[]>;
}

export interface ReviewRepository extends BaseRepository<Review, ReviewEntity, CreateReviewInput> {
  findByRevieweeId(revieweeId: string): Promise<Review[]>;
  findByTransactionId(transactionId: string): Promise<Review[]>;
  calculateAverageRating(userId: string): Promise<number>;
}

// Search and filter types
export interface SearchFilters {
  category?: TicketListing['category'];
  eventName?: string;
  venue?: string;
  city?: string;
  state?: string;
  country?: string;
  minPrice?: number;
  maxPrice?: number;
  eventDateFrom?: Date;
  eventDateTo?: Date;
  status?: TicketListing['status'];
  verificationStatus?: TicketListing['verificationStatus'];
  query?: string; // General search query
  location?: {
    latitude: number;
    longitude: number;
    radius?: number; // in kilometers
  };
  sortBy?: 'relevance' | 'price_asc' | 'price_desc' | 'date_asc' | 'date_desc' | 'distance';
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  listings: TicketListing[];
  total: number;
  aggregations?: {
    categories: Array<{ key: string; count: number }>;
    priceRanges: Array<{ key: string; count: number; from?: number; to?: number }>;
    locations: Array<{ key: string; count: number }>;
  };
  suggestions?: string[];
}



export interface SearchSuggestion {
  text: string;
  type: 'event' | 'venue' | 'location' | 'category';
  count?: number;
}

// Database connection types
export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
  maxConnections?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

export interface DatabaseConnection {
  query<T = any>(text: string, params?: any[]): Promise<T[]>;
  transaction<T>(callback: (client: DatabaseConnection) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

// Payment processing types
export interface PaymentRequest {
  transactionId: string;
  amount: number;
  phoneNumber: string;
  description: string;
}

export interface MpesaSTKPushRequest {
  BusinessShortCode: string;
  Password: string;
  Timestamp: string;
  TransactionType: 'CustomerPayBillOnline';
  Amount: number;
  PartyA: string; // Phone number
  PartyB: string; // Business short code
  PhoneNumber: string;
  CallBackURL: string;
  AccountReference: string;
  TransactionDesc: string;
}

export interface MpesaSTKPushResponse {
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResponseCode: string;
  ResponseDescription: string;
  CustomerMessage: string;
}

export interface MpesaCallbackResponse {
  Body: {
    stkCallback: {
      MerchantRequestID: string;
      CheckoutRequestID: string;
      ResultCode: number;
      ResultDesc: string;
      CallbackMetadata?: {
        Item: Array<{
          Name: string;
          Value: string | number;
        }>;
      };
    };
  };
}

export interface PaymentResult {
  success: boolean;
  transactionId: string;
  mpesaReceiptNumber?: string;
  amount?: number;
  phoneNumber?: string;
  error?: string;
}

export interface EscrowAccount {
  id: string;
  transactionId: string;
  amount: number;
  status: 'held' | 'released' | 'refunded';
  releaseDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface DisputeCase {
  id: string;
  transactionId: string;
  reporterId: string;
  reportedId: string;
  reason: string;
  description: string;
  status: 'open' | 'investigating' | 'resolved' | 'closed';
  resolution?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RefundRequest {
  id: string;
  transactionId: string;
  requesterId: string;
  amount: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'processed';
  processedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Fraud detection and verification types
export interface FraudReport {
  id: string;
  reporterId: string;
  reportedUserId?: string | undefined;
  listingId?: string | undefined;
  transactionId?: string | undefined;
  type: 'fake_ticket' | 'duplicate_listing' | 'suspicious_behavior' | 'payment_fraud' | 'other';
  reason: string;
  description: string;
  evidence?: string[] | undefined;
  status: 'pending' | 'investigating' | 'resolved' | 'dismissed';
  assignedTo?: string | undefined;
  resolution?: string | undefined;
  createdAt: Date;
  updatedAt: Date;
}

export interface SuspiciousActivity {
  id: string;
  userId: string;
  activityType: 'rapid_listing' | 'price_manipulation' | 'duplicate_images' | 'suspicious_login' | 'multiple_accounts';
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  metadata: Record<string, any>;
  status: 'flagged' | 'reviewed' | 'dismissed';
  reviewedBy?: string | undefined;
  reviewNotes?: string | undefined;
  createdAt: Date;
  updatedAt: Date;
}

export interface TicketVerification {
  id: string;
  listingId: string;
  verificationMethod: 'automated' | 'manual' | 'image_analysis';
  status: 'pending' | 'verified' | 'rejected' | 'requires_manual_review';
  confidence: number; // 0-100
  findings: VerificationFinding[];
  reviewedBy?: string | undefined;
  reviewNotes?: string | undefined;
  createdAt: Date;
  updatedAt: Date;
}

export interface VerificationFinding {
  type: 'format_valid' | 'format_invalid' | 'duplicate_image' | 'suspicious_text' | 'price_anomaly' | 'venue_mismatch';
  severity: 'info' | 'warning' | 'error';
  message: string;
  confidence: number;
  metadata?: Record<string, any>;
}

export interface UserSuspension {
  id: string;
  userId: string;
  reason: string;
  suspendedBy: string;
  suspensionType: 'temporary' | 'permanent';
  startDate: Date;
  endDate?: Date | undefined;
  isActive: boolean;
  appealStatus?: 'none' | 'pending' | 'approved' | 'rejected' | undefined;
  appealReason?: string | undefined;
  createdAt: Date;
  updatedAt: Date;
}

// Entity interfaces for fraud detection
export interface FraudReportEntity {
  id: string;
  reporter_id: string;
  reported_user_id?: string | undefined;
  listing_id?: string | undefined;
  transaction_id?: string | undefined;
  type: FraudReport['type'];
  reason: string;
  description: string;
  evidence?: string[] | undefined;
  status: FraudReport['status'];
  assigned_to?: string | undefined;
  resolution?: string | undefined;
  created_at: string;
  updated_at: string;
}

export interface SuspiciousActivityEntity {
  id: string;
  user_id: string;
  activity_type: SuspiciousActivity['activityType'];
  description: string;
  severity: SuspiciousActivity['severity'];
  metadata: string; // JSON string
  status: SuspiciousActivity['status'];
  reviewed_by?: string | undefined;
  review_notes?: string | undefined;
  created_at: string;
  updated_at: string;
}

export interface TicketVerificationEntity {
  id: string;
  listing_id: string;
  verification_method: TicketVerification['verificationMethod'];
  status: TicketVerification['status'];
  confidence: number;
  findings: string; // JSON string
  reviewed_by?: string | undefined;
  review_notes?: string | undefined;
  created_at: string;
  updated_at: string;
}

export interface UserSuspensionEntity {
  id: string;
  user_id: string;
  reason: string;
  suspended_by: string;
  suspension_type: UserSuspension['suspensionType'];
  start_date: string;
  end_date?: string | undefined;
  is_active: boolean;
  appeal_status?: UserSuspension['appealStatus'] | undefined;
  appeal_reason?: string | undefined;
  created_at: string;
  updated_at: string;
}

// Input DTOs for fraud detection
export interface CreateFraudReportInput {
  reporterId: string;
  reportedUserId?: string;
  listingId?: string;
  transactionId?: string;
  type: FraudReport['type'];
  reason: string;
  description: string;
  evidence?: string[];
}

export interface CreateSuspiciousActivityInput {
  userId: string;
  activityType: SuspiciousActivity['activityType'];
  description: string;
  severity: SuspiciousActivity['severity'];
  metadata: Record<string, any>;
}

export interface CreateTicketVerificationInput {
  listingId: string;
  verificationMethod: TicketVerification['verificationMethod'];
  findings: VerificationFinding[];
  confidence: number;
}

export interface CreateUserSuspensionInput {
  userId: string;
  reason: string;
  suspendedBy: string;
  suspensionType: UserSuspension['suspensionType'];
  endDate?: Date;
}

// Notification system types
export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, any>;
  channels: NotificationChannel[];
  status: 'pending' | 'sent' | 'failed' | 'read';
  sentAt?: Date;
  readAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type NotificationType = 
  | 'listing_created'
  | 'listing_sold'
  | 'listing_expired'
  | 'purchase_confirmation'
  | 'payment_received'
  | 'payment_failed'
  | 'transaction_completed'
  | 'review_received'
  | 'price_drop'
  | 'fraud_alert'
  | 'account_suspended'
  | 'verification_required'
  | 'dispute_opened'
  | 'dispute_resolved'
  | 'system_maintenance'
  | 'welcome'
  | 'password_reset';

export type NotificationChannel = 'email' | 'sms' | 'push' | 'in_app';

export interface NotificationPreferences {
  id: string;
  userId: string;
  emailEnabled: boolean;
  smsEnabled: boolean;
  pushEnabled: boolean;
  inAppEnabled: boolean;
  preferences: {
    [K in NotificationType]: {
      email: boolean;
      sms: boolean;
      push: boolean;
      inApp: boolean;
    };
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationTemplate {
  id: string;
  type: NotificationType;
  channel: NotificationChannel;
  subject?: string; // For email
  title: string;
  body: string;
  variables: string[]; // Template variables like {{userName}}, {{eventName}}
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface EmailNotification {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
}

export interface SMSNotification {
  to: string;
  message: string;
  from?: string;
}

export interface PushNotification {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  badge?: number;
  sound?: string;
  icon?: string;
}

// Database entities for notifications
export interface NotificationEntity {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: string; // JSON string
  channels: string; // JSON array
  status: Notification['status'];
  sent_at?: string;
  read_at?: string;
  created_at: string;
  updated_at: string;
}

export interface NotificationPreferencesEntity {
  id: string;
  user_id: string;
  email_enabled: boolean;
  sms_enabled: boolean;
  push_enabled: boolean;
  in_app_enabled: boolean;
  preferences: string; // JSON string
  created_at: string;
  updated_at: string;
}

export interface NotificationTemplateEntity {
  id: string;
  type: NotificationType;
  channel: NotificationChannel;
  subject?: string;
  title: string;
  body: string;
  variables: string; // JSON array
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Input DTOs for notifications
export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, any>;
  channels: NotificationChannel[];
}

export interface UpdateNotificationPreferencesInput {
  emailEnabled?: boolean;
  smsEnabled?: boolean;
  pushEnabled?: boolean;
  inAppEnabled?: boolean;
  preferences?: Partial<NotificationPreferences['preferences']>;
}

export interface CreateNotificationTemplateInput {
  type: NotificationType;
  channel: NotificationChannel;
  subject?: string;
  title: string;
  body: string;
  variables: string[];
}