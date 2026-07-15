import nodemailer from 'nodemailer';
import config from '../config/config';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

const transporter = nodemailer.createTransport({
  host: config.SMTP_HOST,
  port: config.SMTP_PORT,
  secure: config.SMTP_SECURE, // true for 465, false for other ports
  auth: {
    user: config.SMTP_USERNAME,
    pass: config.SMTP_PASSWORD,
  },
});

export const sendEmail = async (options: EmailOptions) => {
  try {
    const mailOptions = {
      from: `"${config.EMAIL_FROM_NAME}" <${config.EMAIL_FROM_ADDRESS}>`,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Message sent: %s', info.messageId);
    return info;
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
};

export const sendPasswordResetEmail = async (email: string, resetToken: string) => {
  const resetUrl = `${config.FRONTEND_URL}/reset-password?token=${resetToken}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Password Reset Request</h2>
      <p>You requested a password reset for your account. Click the button below to reset your password:</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetUrl}" 
           style="background-color: #4CAF50; color: white; padding: 12px 24px; text-align: center; 
                  text-decoration: none; display: inline-block; border-radius: 4px;">
          Reset Password
        </a>
      </div>
      <p>If you didn't request this, you can safely ignore this email.</p>
      <p>This link will expire in 1 hour.</p>
      <hr>
      <p style="color: #666; font-size: 12px;">
        If the button doesn't work, copy and paste this link into your browser:<br>
        ${resetUrl}
      </p>
    </div>
  `;

  const text = `You requested a password reset. Click the following link to reset your password: ${resetUrl}\n\nIf you didn't request this, you can safely ignore this email.`;

  return sendEmail({
    to: email,
    subject: 'Password Reset Request',
    text,
    html,
  });
};

export const sendWelcomeEmail = async (email: string, name: string) => {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Welcome to Our Platform!</h2>
      <p>Hello ${name},</p>
      <p>Thank you for signing up. We're excited to have you on board!</p>
      <p>If you have any questions, feel free to reply to this email.</p>
      <p>Best regards,<br>${config.EMAIL_FROM_NAME}</p>
    </div>
  `;

  return sendEmail({
    to: email,
    subject: 'Welcome to Our Platform!',
    html,
  });
};
