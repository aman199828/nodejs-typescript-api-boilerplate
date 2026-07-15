import crypto from 'crypto';
import prisma from '../lib/prisma';

export interface OTPData {
  userId: number;
  phone: string;
  countryCode: string;
  country: string;
  email: string;
  otp: number;
  type: 'email_update' | 'phone_update';
  expiresAt: Date;
  isUsed: boolean;
}

export class OTPService {
  private static readonly OTP_LENGTH = 6;
  private static readonly OTP_EXPIRY_MINUTES = 10;

  /**
   * Generate a random OTP
   */
  private static generateOTP(): number {
    return crypto.randomInt(100000, 999999);
  }

  /**
   * Send OTP via SMS (placeholder - integrate with your SMS provider)
   */
  private static async sendOTP(phone: string, countryCode: string, otp: number): Promise<boolean> {
    try {
      const fullPhoneNumber = `${countryCode}${phone}`;
      console.log(`Sending OTP ${otp} to ${fullPhoneNumber}`);

      // TODO: Integrate with your SMS provider (Twilio, AWS SNS, etc.)
      // Example:
      // await smsProvider.send({
      //   to: fullPhoneNumber,
      //   message: `Your verification code is: ${otp}. Valid for ${this.OTP_EXPIRY_MINUTES} minutes.`
      // });

      // For now, just log it (remove in production)
      console.log(`OTP for ${fullPhoneNumber}: ${otp}`);
      return true;
    } catch (error) {
      console.error('Error sending OTP:', error);
      return false;
    }
  }

  /**
   * Create and send OTP for email/phone update
   */
  static async createAndSendOTP(
    userId: number,
    phone: string,
    countryCode: string,
    email: string,
    type: 'email_update' | 'phone_update'
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Check if user exists
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, phone: true, countryCode: true },
      });

      if (!user) {
        return { success: false, message: 'User not found' };
      }

      // Check if phone number is already in use by another user
      if (type === 'phone_update') {
        const existingUser = await prisma.user.findFirst({
          where: {
            phone,
            countryCode,
            id: { not: userId },
          },
        });

        if (existingUser) {
          return { success: false, message: 'Phone number already in use by another user' };
        }
      }

      // Generate OTP
      const otp = this.generateOTP();
      const expiresAt = new Date(Date.now() + this.OTP_EXPIRY_MINUTES * 60 * 1000);

      // Update user with new OTP and timestamp (keep existing otpVerified status)
      await prisma.user.update({
        where: { id: userId },
        data: {
          otp,
          otpCreatedAt: new Date(),
        },
      });

      // Send OTP
      const sent = await this.sendOTP(phone, countryCode, otp);

      if (!sent) {
        return { success: false, message: 'Failed to send OTP' };
      }

      return {
        success: true,
        message: `OTP sent to ${countryCode}${phone}`,
      };
    } catch (error) {
      console.error('Error creating OTP:', error);
      return { success: false, message: 'Internal server error' };
    }
  }

  /**
   * Verify OTP and update user data
   */
  static async verifyOTPAndUpdate(
    userId: number,
    otp: number,
    email?: string,
    phone?: string,
    countryCode?: string,
    country?: string
  ): Promise<{ success: boolean; data?: OTPData; message: string }> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          phone: true,
          countryCode: true,
          otp: true,
          otpCreatedAt: true,
          otpVerified: true,
        },
      });

      if (!user) {
        return { success: false, message: 'User not found' };
      }

      // Check if user has a pending OTP for verification
      if (!user.otp || !user.otpCreatedAt) {
        return { success: false, message: 'No OTP found. Please request a new OTP first.' };
      }

      // Check if OTP has expired
      const otpAge = Date.now() - user.otpCreatedAt.getTime();
      const otpAgeMinutes = otpAge / (1000 * 60);

      if (otpAgeMinutes > this.OTP_EXPIRY_MINUTES) {
        return { success: false, message: 'OTP has expired. Please request a new OTP.' };
      }

      if (user.otp !== otp) {
        return { success: false, message: 'Invalid OTP' };
      }

      // Prepare update data
      const updateData: any = {
        otp: null, // Clear the OTP after successful verification
        otpVerifiedAt: new Date(),
      };

      // Update email if provided
      if (email) {
        // Check if email already exists for another user
        const existingEmailUser = await prisma.user.findFirst({
          where: {
            email,
            id: { not: userId },
          },
        });

        if (existingEmailUser) {
          return { success: false, message: 'Email address is already in use by another user' };
        }

        updateData.email = email;
      }

      // Update phone and country code if provided
      if (phone && countryCode) {
        // Check if phone already exists for another user
        const existingPhoneUser = await prisma.user.findFirst({
          where: {
            phone,
            countryCode,
            id: { not: userId },
          },
        });

        if (existingPhoneUser) {
          return { success: false, message: 'Phone number is already in use by another user' };
        }

        updateData.phone = phone;
        updateData.countryCode = countryCode;

        // Update country if provided with phone
        if (country) {
          updateData.country = country;
        }
      }

      // Update user with new data and mark OTP as verified
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: updateData,
        select: {
          id: true,
          email: true,
          phone: true,
          countryCode: true,
          country: true,
          otp: true,
          otpVerified: true,
        },
      });

      return {
        success: true,
        data: {
          userId: updatedUser.id,
          phone: updatedUser.phone || '',
          countryCode: updatedUser.countryCode || '',
          country: updatedUser.country || '',
          email: updatedUser.email,
          otp: 0, // OTP is cleared after verification
          type: email ? 'email_update' : 'phone_update',
          expiresAt: new Date(),
          isUsed: true, // OTP has been used
        },
        message: 'OTP verified and data updated successfully',
      };
    } catch (error) {
      console.error('Error verifying OTP:', error);
      return { success: false, message: 'Internal server error' };
    }
  }

  /**
   * Clean up expired OTPs (reset OTP verification status for old OTPs)
   */
  static async cleanupExpiredOTPs(): Promise<void> {
    try {
      // Reset OTP verification status for users with old OTPs
      // This is a simple cleanup - in production you might want to add timestamp tracking
      await prisma.user.updateMany({
        where: {
          otpVerified: true,
          otpVerifiedAt: {
            lt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
          },
        },
        data: {
          otp: null,
          otpCreatedAt: null,
          otpVerified: false,
          otpVerifiedAt: null,
        },
      });
    } catch (error) {
      console.error('Error cleaning up expired OTPs:', error);
    }
  }
}
