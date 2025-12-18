import { create } from 'zustand';
import { buildElectronConfig } from '../utils/electronConfig';
import type { OrbitalSpec } from '../utils/electronConfig';

export type DisplayMode = 'volume' | 'points';

export type AtomState = {
  Z: number;
  charge: number;
  orbitals: OrbitalSpec[];
  selectedOrbitalIndex: number;
  displayMode: DisplayMode;
  isoValue: number;
  sampleCount: number;
  setElement: (Z: number) => void;
  setCharge: (charge: number) => void;
  setDisplayMode: (mode: DisplayMode) => void;
  setIsoValue: (v: number) => void;
  setSelectedOrbital: (index: number) => void;
  setSampleCount: (count: number) => void;
  refreshOrbitals: () => void;
};

const clampZ = (Z: number) => Math.min(118, Math.max(1, Math.round(Z)));
const clampCharge = (charge: number, Z: number) =>
  Math.min(Z - 1, Math.max(-Z, Math.round(charge)));

export const useAtomState = create<AtomState>((set, get) => ({
  Z: 1,
  charge: 0,
  orbitals: buildElectronConfig(1, 0),
  selectedOrbitalIndex: 0,
  displayMode: 'volume',
  isoValue: 0.4,
  sampleCount: 8000,
  setElement: (Z) => {
    const safeZ = clampZ(Z);
    const { charge } = get();
    const safeCharge = clampCharge(charge, safeZ);
    const orbitals = buildElectronConfig(safeZ, safeCharge);
    set({ Z: safeZ, charge: safeCharge, orbitals, selectedOrbitalIndex: orbitals.length - 1 });
  },
  setCharge: (charge) => {
    const { Z } = get();
    const safeCharge = clampCharge(charge, Z);
    const orbitals = buildElectronConfig(Z, safeCharge);
    set({ charge: safeCharge, orbitals, selectedOrbitalIndex: Math.max(0, orbitals.length - 1) });
  },
  setDisplayMode: (mode) => set({ displayMode: mode }),
  setIsoValue: (v) => set({ isoValue: v }),
  setSelectedOrbital: (index) => {
    const { orbitals } = get();
    const safe = Math.min(Math.max(index, 0), orbitals.length - 1);
    set({ selectedOrbitalIndex: safe });
  },
  setSampleCount: (count) => set({ sampleCount: Math.max(500, Math.round(count)) }),
  refreshOrbitals: () => {
    const { Z, charge } = get();
    const orbitals = buildElectronConfig(Z, charge);
    set({ orbitals, selectedOrbitalIndex: Math.max(0, orbitals.length - 1) });
  },
}));
