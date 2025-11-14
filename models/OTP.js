const mongoose = require('mongoose');
const mailSender = require('../utils/emailService');

const OTPSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    otp: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true, // gives you createdAt
  }
);

// TTL index to auto-delete after 5 minutes
OTPSchema.index({ createdAt: 1 }, { expireAfterSeconds: 900 });

// Send email before saving
// OTPSchema.pre('save', async function (next) {
//   if (this.isNew) {
//     try {
//       await mailSender.sendEmail({
//         email: this.email,
//         subject: 'Verification From Creed',
//         template: 'emailVerification',
//         data: {
//           name: 'User',
//           otp: this.otp,
//         },
//       });
//       console.log('OTP email sent successfully');
//     } catch (error) {
//       console.error('Error sending OTP email:', error);
//     }
//   }
//   next();
// });

module.exports = mongoose.model('OTP', OTPSchema);
