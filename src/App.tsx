import { useMemo } from 'react';
import './App.css';
import { OrbitalViewer } from './components/OrbitalViewer';
import { elements } from './data/elements';
import { useAtomState } from './state/atomState';

function App() {
  const {
    Z,
    charge,
    orbitals,
    selectedOrbitalIndex,
    isoValue,
    displayMode,
    sampleCount,
    setElement,
    setCharge,
    setIsoValue,
    setDisplayMode,
    setSampleCount,
    setSelectedOrbital,
  } = useAtomState();

  const elementInfo = useMemo(() => elements.find((e) => e.Z === Z), [Z]);
  const orbital = orbitals[selectedOrbitalIndex];

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">Atomic visualization</div>
          <h1>Orbital Explorer</h1>
        </div>
        <div className="tagline">Hydrogenic | s, p, d, f | element + ion selector</div>
      </header>

      <div className="layout">
        <section className="controls-panel">
          <div className="control">
            <label>Element</label>
            <select value={Z} onChange={(e) => setElement(Number(e.target.value))}>
              {elements.map((el) => (
                <option key={el.Z} value={el.Z}>
                  {el.Z}. {el.symbol} — {el.name}
                </option>
              ))}
            </select>
          </div>

          <div className="control">
            <label>Ion charge (e)</label>
            <input
              type="number"
              value={charge}
              min={-Z}
              max={Z - 1}
              step={1}
              onChange={(e) => setCharge(Number(e.target.value))}
            />
          </div>

          <div className="control">
            <label>Orbital</label>
            <select
              value={selectedOrbitalIndex}
              onChange={(e) => setSelectedOrbital(Number(e.target.value))}
            >
              {orbitals.map((o, i) => (
                <option key={`${o.n}-${o.l}-${o.m}-${i}`} value={i}>
                  {o.n}
                  {['s', 'p', 'd', 'f'][o.l] ?? `l${o.l}`} (m={o.m}) · occ {o.occupancy}
                </option>
              ))}
            </select>
          </div>

          <div className="control">
            <label>Iso-value threshold</label>
            <input
              type="range"
              min={0}
              max={0.8}
              step={0.01}
              value={isoValue}
              onChange={(e) => setIsoValue(Number(e.target.value))}
            />
            <div className="value">{isoValue.toFixed(2)}</div>
          </div>

          <div className="control buttons">
            <button
              className={displayMode === 'volume' ? 'active' : ''}
              onClick={() => setDisplayMode('volume')}
            >
              Volume raymarch
            </button>
            <button
              className={displayMode === 'points' ? 'active' : ''}
              onClick={() => setDisplayMode('points')}
            >
              Point cloud
            </button>
          </div>

          {displayMode === 'points' && (
            <div className="control">
              <label>Samples</label>
              <input
                type="range"
                min={500}
                max={20000}
                step={500}
                value={sampleCount}
                onChange={(e) => setSampleCount(Number(e.target.value))}
              />
              <div className="value">{sampleCount}</div>
            </div>
          )}

          <div className="summary">
            <div>{elementInfo ? `${elementInfo.symbol} (${elementInfo.name})` : `Z=${Z}`}</div>
            <div>Charge: {charge >= 0 ? `+${charge}` : charge}</div>
            {orbital && (
              <div>
                n={orbital.n}, l={orbital.l}, m={orbital.m}, occupancy {orbital.occupancy}
              </div>
            )}
          </div>
        </section>

        <section className="viewer-panel">
          <OrbitalViewer />
        </section>
      </div>
    </div>
  );
}

export default App;
