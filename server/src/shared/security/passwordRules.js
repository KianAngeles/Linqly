function validatePassword(pw) {
  // 8+ chars, 1 uppercase, 1 lowercase, 1 special
  const re = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[^A-Za-z0-9])(?=.{8,}).*$/;
  return re.test(pw);
}

module.exports = { validatePassword };
