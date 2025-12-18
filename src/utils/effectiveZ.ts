// Simple Slater-based effective nuclear charge approximation.
export const effectiveZ = (Z: number, n: number, l: number) => {
  const electrons = Z;
  if (electrons <= 1) return Math.max(1, Z);

  const shielding = computeShielding(electrons, n, l);
  const zeff = Z - shielding;
  return Math.max(0.2, zeff);
};

const computeShielding = (Z: number, n: number, l: number) => {
  // Groups based on Slater's rules
  const groupings: Array<{ range: [number, number]; factor: number }> = [];
  if (n === 1) {
    groupings.push({ range: [1, Z - 1], factor: 0.30 });
  } else if (n === 2) {
    groupings.push({ range: [1, 2], factor: 0.85 });
    if (Z > 2) groupings.push({ range: [3, Z - 1], factor: 0.35 });
  } else {
    // For n >= 3
    groupings.push({ range: [Z - coreCount(n, l), Z - 1], factor: 1.00 });
    const nMinusOne = Math.max(2, n - 1);
    const core = coreCount(nMinusOne, l);
    if (core > 0) groupings.push({ range: [Math.max(1, Z - core), Z - coreCount(n, l) - 1], factor: 0.85 });
    const lowerCore = Z - (core + coreCount(n, l));
    if (lowerCore > 0) groupings.push({ range: [1, lowerCore], factor: 1.00 });
  }

  let S = 0;
  for (const g of groupings) {
    const electronsInRange = Math.max(0, g.range[1] - g.range[0] + 1);
    S += electronsInRange * g.factor;
  }
  return S;
};

const coreCount = (n: number, l: number) => {
  if (n <= 1) return 0;
  // crude core estimate: all electrons in lower shells
  const shells = [2, 8, 18, 32, 50, 72, 98];
  const index = Math.max(0, Math.min(shells.length - 1, n - 2));
  const core = shells[index];
  // adjust for penetrating s/p orbitals by reducing a small portion
  const penetration = l === 0 ? 0.2 : l === 1 ? 0.1 : 0;
  return Math.max(0, core - penetration * core);
};
