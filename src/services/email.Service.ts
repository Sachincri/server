import nodemailer, { Transporter } from "nodemailer";
import sgMail from "@sendgrid/mail";
import logger from "../utils/logger";
import Settings from "../models/Settings.model";

interface EmailOptions {
  email: string;
  subject: string;
  message: string;
  html: string;
}

class EmailService {
  private smtpTransporter: Transporter;

  constructor() {
    this.smtpTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: parseInt(process.env.SMTP_PORT || "587") === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    if (process.env.SENDGRID_API_KEY) {
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    }
  }

  async sendEmail(options: EmailOptions): Promise<void> {
    const settings = await Settings.findOne();
    const service = settings?.emailService || "smtp";

    const from = `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`;

    try {
      if (service === "sendgrid" && process.env.SENDGRID_API_KEY) {
        await sgMail.send({
          to: options.email,
          from: process.env.FROM_EMAIL!, // SendGrid often requires just the email or a verified sender
          subject: options.subject,
          text: options.message,
          html: options.html,
        });
        logger.info(`Email sent via SendGrid to ${options.email}`);
      } else {
        const mailOptions = {
          from,
          to: options.email,
          subject: options.subject,
          text: options.message,
          html: options.html,
        };
        await this.smtpTransporter.sendMail(mailOptions);
        logger.info(`Email sent via SMTP to ${options.email}`);
      }
    } catch (error) {
      logger.error(`Error sending email via ${service}:`, error);
      throw error;
    }
  }

  async sendOTP(email: string, otp: string): Promise<void> {
    const message = `Your OTP for verification is: ${otp}. This OTP is valid for ${process.env.OTP_EXPIRE_MINUTES} minutes.`;
    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2>Email Verification</h2>
        <p>Your OTP for verification is:</p>
        <h1 style="color: #4CAF50; font-size: 32px; letter-spacing: 5px;">${otp}</h1>
        <p>This OTP is valid for ${process.env.OTP_EXPIRE_MINUTES} minutes.</p>
        <p>If you didn't request this, please ignore this email.</p>
      </div>
    `;

    await this.sendEmail({
      email,
      subject: "Email Verification OTP",
      message,
      html,
    });
  }

  async sendPasswordReset(email: string, resetURL: string): Promise<void> {
    const message = `Forgot your password? Click on the link below to reset it:\n\n${resetURL}\n\nIf you didn't request this, please ignore this email.`;
    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2>Password Reset Request</h2>
        <p>You requested to reset your password. Click the button below to proceed:</p>
        <a href="${resetURL}" style="display: inline-block; padding: 10px 20px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0;">Reset Password</a>
        <p>Or copy this link: ${resetURL}</p>
        <p>This link is valid for 10 minutes.</p>
        <p>If you didn't request this, please ignore this email.</p>
      </div>
    `;

    await this.sendEmail({
      email,
      subject: "Password Reset Request",
      message,
      html,
    });
  }

  async sendWelcomeEmail(email: string, name: string): Promise<void> {
    const message = `Welcome to our E-Commerce platform, ${name}! We're excited to have you on board.`;
    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2>Welcome to E-Commerce!</h2>
        <p>Hi ${name},</p>
        <p>Thank you for joining us. Start exploring our wide range of products now!</p>
        <p>Happy Shopping!</p>
      </div>
    `;

    await this.sendEmail({
      email,
      subject: "Welcome to E-Commerce",
      message,
      html,
    });
  }

  async sendOrderConfirmation(email: string, name: string, orderId: string, totalAmount: number, items: any[] = []): Promise<void> {
    const message = `Thank you for your order! Your order ID is ${orderId}. Total Amount: ${totalAmount}.`;

    const itemsHtml = items.map((item: any) => `
      <tr>
        <td style="padding: 15px; border-bottom: 1px solid #e2e8f0; background-color: #ffffff;">
          <table width="100%" border="0" cellspacing="0" cellpadding="0">
            <tr>
              <td width="60" style="padding-right: 15px; vertical-align: top;">
                <img src="${item.image || 'https://via.placeholder.com/60'}" alt="${item.name}" width="60" height="60" style="border-radius: 6px; object-fit: cover;">
              </td>
              <td style="vertical-align: top;">
                <p style="margin: 0 0 5px 0; color: #0f172a; font-size: 14px; font-weight: 600;">${item.name}</p>
                <p style="margin: 0; color: #64748b; font-size: 13px;">Qty: ${item.quantity} ${item.size ? '| Size: ' + item.size : ''} ${item.color ? '| Color: ' + item.color : ''}</p>
              </td>
              <td style="vertical-align: top; text-align: right; width: 80px;">
                <p style="margin: 0; color: #0f172a; font-size: 14px; font-weight: 600;">₹${item.sellingPrice}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    `).join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Order Confirmation</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f4f4f5; padding: 40px 0;">
          <tr>
            <td align="center">
              <table width="600" border="0" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);">
                
                <!-- Header -->
                <tr>
                  <td style="padding: 40px 40px 20px 40px; text-align: center; background-color: #ffffff;">
                    <h1 style="margin: 0; color: #18181b; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">Order Confirmed!</h1>
                    <p style="margin: 10px 0 0 0; color: #71717a; font-size: 16px;">Thank you for your purchase</p>
                  </td>
                </tr>

                <!-- Content -->
                <tr>
                  <td style="padding: 20px 40px;">
                    <p style="margin: 0 0 20px 0; color: #3f3f46; font-size: 16px; line-height: 1.5;">Hi ${name},</p>
                    <p style="margin: 0 0 20px 0; color: #52525b; font-size: 16px; line-height: 1.5;">
                      We're excited to let you know that we've received your order. We're getting it ready for shipment and will notify you as soon as it's on its way.
                    </p>

                    <!-- Order Items -->
                    ${items.length > 0 ? `
                    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 24px;">
                      <tr>
                        <td>
                          <h3 style="margin: 0 0 10px 0; color: #0f172a; font-size: 16px; font-weight: 600;">Items in your order</h3>
                          <table width="100%" border="0" cellspacing="0" cellpadding="0" style="border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
                            ${itemsHtml}
                          </table>
                        </td>
                      </tr>
                    </table>
                    ` : ''}

                    <!-- Order Details Box -->
                    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 24px;">
                      <tr>
                        <td style="padding: 20px;">
                          <table width="100%" border="0" cellspacing="0" cellpadding="0">
                            <tr>
                              <td style="padding-bottom: 10px; color: #64748b; font-size: 14px;">Order ID</td>
                              <td style="padding-bottom: 10px; color: #0f172a; font-size: 14px; font-weight: 600; text-align: right;">#${orderId}</td>
                            </tr>
                            <tr>
                              <td style="padding-top: 10px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 14px;">Total Amount</td>
                              <td style="padding-top: 10px; border-top: 1px solid #e2e8f0; color: #0f172a; font-size: 18px; font-weight: 700; text-align: right;">₹${totalAmount}</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>

                    <!-- CTA Button -->
                    <table width="100%" border="0" cellspacing="0" cellpadding="0">
                      <tr>
                        <td align="center">
                          <a href="${process.env.CLIENT_URL || 'http://localhost:3000'}/account/orders/${orderId}" style="display: inline-block; padding: 14px 32px; background-color: #000000; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 6px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
                            View Order Details
                          </a>
                        </td>
                      </tr>
                    </table>

                    <p style="margin: 30px 0 0 0; color: #71717a; font-size: 14px; text-align: center;">
                      If you have any questions, simply reply to this email or contact our support team.
                    </p>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="padding: 30px 40px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center;">
                    <p style="margin: 0; color: #94a3b8; font-size: 12px;">
                      &copy; ${new Date().getFullYear()} E-Commerce Store. All rights reserved.
                    </p>
                    <p style="margin: 5px 0 0 0; color: #94a3b8; font-size: 12px;">
                      123 Commerce St, Business City, 12345
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    await this.sendEmail({
      email,
      subject: `Order Confirmation - ${orderId}`,
      message,
      html,
    });
  }
}

export default new EmailService();
