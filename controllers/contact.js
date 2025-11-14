// Admin email addresses
const { default: axios } = require('axios');
const dotenv = require('dotenv');
dotenv.config();

const ADMIN_EMAILS = ['pranav.c@thpl.co.in', 'helpdesk@thpl.co.in'];
const EMAIL_SERVICE_URL = process.env.EMAIL_SERVICE_URL;

/**
 * Create axios instance with default config
 */
const emailServiceAPI = axios.create({
  baseURL: EMAIL_SERVICE_URL,
  timeout: 30000, // 30 seconds timeout
  headers: {
    'Content-Type': 'application/json',
  },
});
const postContact = async (req, res) => {
  try {
    const { name, email, phone, subject, category, message } = req.body;

    // Validate required fields
    if (!name || !email || !subject || !message) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, subject, and message are required fields',
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address',
      });
    }

    // Prepare form data for email templates
    const formData = {
      name,
      email,
      phone,
      subject,
      category,
      message,
    };

    // Send admin notification emails
    try {
      const adminEmailPromises = ADMIN_EMAILS.map(async (adminEmail) => {
        const response = await emailServiceAPI.post('/send-contact-admin', {
          adminEmail: adminEmail,
          formData: formData,
          userEmail: email,
        });
        return response;
      });

      await Promise.all(adminEmailPromises);
      console.log(`Admin notification emails sent successfully for: ${email}`);
    } catch (error) {
      console.error('Error sending admin emails:', error);
      // Log error but don't fail the request
    }

    // Send auto-reply to user
    try {
      const response = await emailServiceAPI.post('/send-contact-auto-reply', {
        email: email,
        name: name,
      });

      console.log(`Auto-reply email sent successfully to: ${email}`);
    } catch (error) {
      console.error('Error sending user auto-reply:', error);
      // Log error but don't fail the request
    }

    res.status(201).json({
      success: true,
      message:
        'Contact request submitted successfully. You will receive a confirmation email shortly.',
      data: {
        name: name,
        email: email,
        subject: subject,
      },
    });
  } catch (error) {
    console.error('Error submitting contact request:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error. Please try again later.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

module.exports = {
  postContact,
};
