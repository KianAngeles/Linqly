const {
  normalizeRegisterPayload,
  validateRegisterPayload,
} = require("../validators/register.validator");

function validateRegister(req, res, next) {
  const normalized = normalizeRegisterPayload(req.body || {});
  const error = validateRegisterPayload(req.body || {});
  if (error) {
    return res.status(400).json({ message: error });
  }
  req.body = { ...req.body, ...normalized };
  return next();
}

module.exports = {
  validateRegister,
};

