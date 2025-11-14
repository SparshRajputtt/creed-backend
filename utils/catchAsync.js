/**
 * Catches async errors and passes them to the next middleware
 * This eliminates the need for try-catch blocks in async route handlers
 *
 * @param {Function} fn - The async function to wrap
 * @returns {Function} - Express middleware function
 *
 * Usage:
 * exports.getUsers = catchAsync(async (req, res, next) => {
 *   const users = await User.find();
 *   res.status(200).json({ users });
 * });
 */
const catchAsync = (fn) => {
  return (req, res, next) => {
    // Execute the async function and catch any promise rejections
    fn(req, res, next).catch(next);
  };
};

module.exports = catchAsync;
