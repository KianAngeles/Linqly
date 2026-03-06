function makePairKey(idA, idB) {
  const a = idA.toString();
  const b = idB.toString();
  return [a, b].sort().join(":");
}

module.exports = { makePairKey };
