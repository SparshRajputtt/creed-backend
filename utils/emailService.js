const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
dotenv.config();

/**
 * Create email transporter
 */
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_PORT == 465, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_EMAIL,
      pass: process.env.SMTP_PASSWORD,
    },
  });
};

/**
 * Email templates
 */
const emailTemplates = {
  emailVerification: (data) => {
    // If OTP is provided, show OTP template, otherwise show verification URL
    if (data.otp) {
      return `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>OTP Verification Email</title>
          <style>
            body {
              background-color: #ffffff;
              font-family: Arial, sans-serif;
              font-size: 16px;
              line-height: 1.4;
              color: #333333;
              margin: 0;
              padding: 0;
            }
            .container {
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
              text-align: center;
            }
            .logo {
              max-width: 200px;
            }
            .message {
              font-size: 18px;
              font-weight: bold;
              margin-bottom: 20px;
            }
            .body {
              font-size: 16px;
              margin-bottom: 20px;
            }
            .otp {
              display: inline-block;
              padding: 10px 20px;
              background-color: #FFD60A;
              color: #000000;
              text-decoration: none;
              border-radius: 5px;
              font-size: 24px;
              font-weight: bold;
              margin: 20px 0;
              letter-spacing: 2px;
            }
            .support {
              font-size: 14px;
              color: #999999;
              margin-top: 20px;
            }
            .highlight {
              font-weight: bold;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="message">OTP Verification Email</div>
            <div class="body">
              <p>Dear ${data.name || 'User'},</p>
              <p>Thank you for registering with Creed. To complete your registration, please use the following OTP (One-Time Password) to verify your account:</p>
              <div class="otp">${data.otp}</div>
              <p>This OTP is valid for 5 minutes. If you did not request this verification, please disregard this email.</p>
            </div>
            <div class="support">If you have any questions or need assistance, please feel free to reach out to us at info@creed.com. We are here to help!</div>
          </div>
        </body>
        </html>
      `;
    } else {
      return `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>Email Verification</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #007bff; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9f9f9; }
            .button { display: inline-block; padding: 12px 24px; background: #007bff; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Welcome to Creed!</h1>
            </div>
            <div class="content">
              <h2>Hello ${data.name},</h2>
              <p>Thank you for registering with Creed. Please verify your email address by clicking the button below:</p>
              <a href="${data.verificationUrl}" class="button">Verify Email</a>
              <p>If the button doesn't work, copy and paste this link into your browser:</p>
              <p>${data.verificationUrl}</p>
              <p>This link will expire in 24 hours.</p>
            </div>
            <div class="footer">
              <p>&copy; 2024 Creed. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `;
    }
  },

  passwordReset: (data) => `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Password Reset</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #dc3545; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background: #f9f9f9; }
        .button { display: inline-block; padding: 12px 24px; background: #dc3545; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Password Reset Request</h1>
        </div>
        <div class="content">
          <h2>Hello ${data.name},</h2>
          <p>You requested a password reset for your Creed account. Click the button below to reset your password:</p>
          <a href="${data.resetUrl}" class="button">Reset Password</a>
          <p>If the button doesn't work, copy and paste this link into your browser:</p>
          <p>${data.resetUrl}</p>
          <p>This link will expire in 10 minutes.</p>
          <p>If you didn't request this password reset, please ignore this email.</p>
        </div>
        <div class="footer">
          <p>&copy; 2024 Creed. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `,

  orderConfirmation: (data) => `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Order Confirmation</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #28a745; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background: #f9f9f9; }
        .order-details { background: white; padding: 15px; margin: 15px 0; border-radius: 5px; }
        .item { border-bottom: 1px solid #eee; padding: 10px 0; }
        .total { font-weight: bold; font-size: 18px; color: #28a745; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Order Confirmed!</h1>
        </div>
        <div class="content">
          <h2>Hello ${data.customerName},</h2>
          <p>Thank you for your order! Your order has been confirmed and is being processed.</p>
          
          <div class="order-details">
            <h3>Order Details</h3>
            <p><strong>Order Number:</strong> ${data.orderNumber}</p>
            <p><strong>Order Date:</strong> ${data.orderDate}</p>
            
            <h4>Items Ordered:</h4>
            ${data.items
              .map(
                (item) => `
              <div class="item">
                <p><strong>${item.name}</strong></p>
                <p>Quantity: ${item.quantity} × $${item.price} = $${item.subtotal}</p>
              </div>
            `
              )
              .join('')}
            
            <div class="total">
              <p>Total: $${data.total}</p>
            </div>
          </div>
          
          <p>We'll send you another email when your order ships.</p>
        </div>
        <div class="footer">
          <p>&copy; 2024 Creed. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `,
};

/**
 * Send email
 */
const sendEmail = async ({ email, subject, template, data }) => {
  try {
    const transporter = createTransporter();

    // Get email template
    const htmlContent = emailTemplates[template]
      ? emailTemplates[template](data)
      : data.html;

    const mailOptions = {
      from: `"Creed" <${process.env.SMTP_EMAIL}>`,
      to: email,
      subject,
      html: htmlContent,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent:', info.messageId);
    return info;
  } catch (error) {
    console.error('Email sending failed:', error);
    throw error;
  }
};

/**
 * Send bulk emails
 */
const sendBulkEmail = async (emails) => {
  try {
    const transporter = createTransporter();
    const results = [];

    for (const emailData of emails) {
      try {
        const htmlContent = emailTemplates[emailData.template]
          ? emailTemplates[emailData.template](emailData.data)
          : emailData.data.html;

        const mailOptions = {
          from: `"Creed" <${process.env.SMTP_EMAIL}>`,
          to: emailData.email,
          subject: emailData.subject,
          html: htmlContent,
        };

        const info = await transporter.sendMail(mailOptions);
        results.push({
          email: emailData.email,
          success: true,
          messageId: info.messageId,
        });
      } catch (error) {
        results.push({
          email: emailData.email,
          success: false,
          error: error.message,
        });
      }
    }

    return results;
  } catch (error) {
    console.error('Bulk email sending failed:', error);
    throw error;
  }
};

module.exports = {
  sendEmail,
  sendBulkEmail,
};
