export type OrbitalSpec = {
  n: number;
  l: number;
  m: number;
  occupancy: number;
  label: string;
};

const subshellOrder: Array<{ n: number; l: number }> = [
  { n: 1, l: 0 },
  { n: 2, l: 0 },
  { n: 2, l: 1 },
  { n: 3, l: 0 },
  { n: 3, l: 1 },
  { n: 4, l: 0 },
  { n: 3, l: 2 },
  { n: 4, l: 1 },
  { n: 5, l: 0 },
  { n: 4, l: 2 },
  { n: 5, l: 1 },
  { n: 6, l: 0 },
  { n: 4, l: 3 },
  { n: 5, l: 2 },
  { n: 6, l: 1 },
  { n: 7, l: 0 },
  { n: 5, l: 3 },
  { n: 6, l: 2 },
  { n: 7, l: 1 },
];

const subshellLabel = (l: number) => ['s', 'p', 'd', 'f'][l] ?? `l${l}`;
const subshellCapacity = (l: number) => 2 * (2 * l + 1);

export const buildElectronConfig = (Z: number, charge: number): OrbitalSpec[] => {
  const electrons = Math.max(0, Z - charge);
  let remaining = electrons;
  const orbitals: OrbitalSpec[] = [];

  for (const { n, l } of subshellOrder) {
    if (remaining <= 0) break;
    const capacity = subshellCapacity(l);
    const fill = Math.min(remaining, capacity);
    const mValues = Array.from({ length: 2 * l + 1 }, (_, i) => i - l);
    let left = fill;
    for (const m of mValues) {
      if (left <= 0) break;
      const take = Math.min(2, left);
      orbitals.push({
        n,
        l,
        m,
        occupancy: take,
        label: `${n}${subshellLabel(l)} (m=${m})`,
      });
      left -= take;
    }
    remaining -= fill;
  }

  return orbitals.filter((o) => o.occupancy > 0);
};
