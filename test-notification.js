// Simple test to verify notification system is working
const { emailService } = require('./dist/config/email');
const { smsService } = require('./dist/config/sms');
const { pushNotificationService } = require('./dist/config/push');

console.log('Testing notification services...');

// Test email service
console.log('Email service:', emailService ? 'Available' : 'Not available');

// Test SMS service
console.log('SMS service:', smsService ? 'Available' : 'Not available');

// Test push notification service
console.log('Push notification service:', pushNotificationService ? 'Available' : 'Not available');

console.log('Notification system test completed.');