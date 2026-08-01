"use client";

import { useEffect, useMemo, useState } from "react";

type TicketStatus = "ready" | "plating";
type Zone = "Dining room" | "Patio" | "Bar";
type Shape = "round" | "square" | "booth";
type Area = "indoor" | "outdoor";
type ServiceState = "fresh" | "watch" | "late" | "critical" | "plating" | "clear";

type StatusOverride = {
  state: ServiceState;
  startedAt: number;
};

const GRID_STEP = 2.5;
const ALIGNMENT_THRESHOLD = 1.5;

type Ticket = {
  id: number;
  table: string;
  guests: number;
  zone: Zone;
  elapsedSeconds: number;
  status: TicketStatus;
};

type FloorTable = {
  id: number;
  label: string;
  x: number;
  y: number;
  shape: Shape;
  seats: number;
  area: Area;
  rotation?: number;
};

type BarChair = {
  id: number;
  label: string;
  x: number;
  y: number;
};

const initialTickets: Ticket[] = [];
const defaultFloorTables: FloorTable[] = [];
const defaultBarChairs: BarChair[] = [];

const migratedOutdoorPositions: Record<number, { x: number; y: number }> = {
  10: { x: 19, y: 31 }, 11: { x: 43, y: 31 }, 12: { x: 67, y: 31 }, 7: { x: 42, y: 67 },
};

const statusOptions: Array<{ state: ServiceState; label: string; shortLabel: string }> = [
  { state: "fresh", label: "Needs to be greeted", shortLabel: "GREET" },
  { state: "late", label: "Send now", shortLabel: "SEND" },
  { state: "critical", label: "Overdue", shortLabel: "OVERDUE" },
  { state: "plating", label: "Serving", shortLabel: "SERVING" },
  { state: "clear", label: "Clear", shortLabel: "CLEAR" },
];

function statusLabel(state: ServiceState) {
  return statusOptions.find((option) => option.state === state)?.label ?? state;
}

function shortStatusLabel(state: ServiceState) {
  return statusOptions.find((option) => option.state === state)?.shortLabel ?? state;
}

function urgency(seconds: number) {
  if (seconds >= 900) return "critical";
  if (seconds >= 600) return "late";
  if (seconds >= 420) return "watch";
  return "fresh";
}

function formatTimer(seconds: number) {
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, "0")}`;
}

function formatClock(date: Date) {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function tableState(ticket: Ticket | undefined, tick: number) {
  if (!ticket) return "clear";
  if (ticket.status === "plating") return "plating";
  return urgency(ticket.elapsedSeconds + tick);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function snapToGrid(value: number) {
  return Math.round(value / GRID_STEP) * GRID_STEP;
}

function snapToObjects(value: number, candidates: number[]) {
  const nearest = candidates.reduce<number | null>((match, candidate) => {
    if (Math.abs(candidate - value) > ALIGNMENT_THRESHOLD) return match;
    if (match === null || Math.abs(candidate - value) < Math.abs(match - value)) return candidate;
    return match;
  }, null);
  return { value: nearest ?? snapToGrid(value), guide: nearest };
}

export default function Home() {
  const [tickets, setTickets] = useState(initialTickets);
  const [selectedId, setSelectedId] = useState(0);
  const [clock, setClock] = useState<Date | null>(null);
  const [tick, setTick] = useState(0);
  const [lastServed, setLastServed] = useState<Ticket | null>(null);
  const [floorTables, setFloorTables] = useState(defaultFloorTables);
  const [barChairs, setBarChairs] = useState(defaultBarChairs);
  const [statusOverrides, setStatusOverrides] = useState<Record<string, StatusOverride>>({});
  const [selectedChairId, setSelectedChairId] = useState<number | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [layoutLoaded, setLayoutLoaded] = useState(false);
  const [addShape, setAddShape] = useState<Shape>("round");
  const [activeArea, setActiveArea] = useState<Area>("indoor");
  const [snapGuides, setSnapGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });

  useEffect(() => {
    const savedLayout = window.localStorage.getItem("pass-floor-layout");
    if (savedLayout) {
      try {
        const parsed = JSON.parse(savedLayout) as Array<Omit<FloorTable, "area"> & { area?: Area }>;
        setFloorTables(parsed.map((table) => {
          if (table.area) return table as FloorTable;
          const outdoorPosition = migratedOutdoorPositions[table.id];
          return { ...table, area: outdoorPosition ? "outdoor" : "indoor", ...(outdoorPosition ?? {}) };
        }));
      } catch {
        window.localStorage.removeItem("pass-floor-layout");
      }
    }
    const savedBarChairs = window.localStorage.getItem("pass-bar-chairs");
    if (savedBarChairs) {
      try {
        const parsed = JSON.parse(savedBarChairs) as Array<Omit<BarChair, "label"> & { label?: string }>;
        setBarChairs(parsed.map((chair, index) => ({ ...chair, label: chair.label ?? `B${index + 1}` })));
      } catch {
        window.localStorage.removeItem("pass-bar-chairs");
      }
    }
    const savedStatuses = window.localStorage.getItem("mybites-table-statuses");
    if (savedStatuses) {
      try {
        const parsed = JSON.parse(savedStatuses) as Record<string, StatusOverride>;
        setStatusOverrides(Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, value.state === "watch" ? { ...value, state: "late" as const } : value])));
      } catch {
        window.localStorage.removeItem("mybites-table-statuses");
      }
    }
    setLayoutLoaded(true);
    setClock(new Date());
    const interval = window.setInterval(() => {
      setTick((value) => value + 1);
      setClock(new Date());
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (layoutLoaded) window.localStorage.setItem("pass-floor-layout", JSON.stringify(floorTables));
  }, [floorTables, layoutLoaded]);

  useEffect(() => {
    if (layoutLoaded) window.localStorage.setItem("pass-bar-chairs", JSON.stringify(barChairs));
  }, [barChairs, layoutLoaded]);

  useEffect(() => {
    if (layoutLoaded) window.localStorage.setItem("mybites-table-statuses", JSON.stringify(statusOverrides));
  }, [statusOverrides, layoutLoaded]);

  const visibleTickets = useMemo(() => tickets.map((ticket) => ({ ...ticket, elapsedSeconds: ticket.elapsedSeconds + tick })), [tickets, tick]);
  const readyTickets = visibleTickets.filter((ticket) => ticket.status === "ready").sort((a, b) => b.elapsedSeconds - a.elapsedSeconds);
  const visibleFloorTables = floorTables.filter((table) => table.area === activeArea);
  const areaReadyTickets = readyTickets.filter((ticket) => activeArea === "outdoor" ? ticket.zone === "Patio" : ticket.zone !== "Patio");
  const selectedTable = floorTables.find((table) => table.id === selectedId);
  const selectedChair = barChairs.find((chair) => chair.id === selectedChairId);
  const selectedTicket = selectedChair
    ? visibleTickets.find((ticket) => ticket.zone === "Bar" && ticket.table === selectedChair.label)
    : visibleTickets.find((ticket) => ticket.id === selectedId);
  const selectedObjectKey = selectedChair ? `chair:${selectedChair.id}` : selectedTable ? `table:${selectedTable.id}` : null;
  const selectedOverride = selectedObjectKey ? statusOverrides[selectedObjectKey] : undefined;
  const selectedState = selectedOverride?.state ?? tableState(selectedTicket, 0);
  const selectedElapsed = selectedOverride
    ? Math.max(0, Math.floor(((clock?.getTime() ?? selectedOverride.startedAt) - selectedOverride.startedAt) / 1000))
    : selectedTicket?.elapsedSeconds ?? 0;
  const manualWaits = clock
    ? Object.values(statusOverrides).filter((status) => status.state !== "clear" && status.state !== "plating").map((status) => Math.max(0, Math.floor((clock.getTime() - status.startedAt) / 1000)))
    : [];
  const longestWait = Math.max(readyTickets[0]?.elapsedSeconds ?? 0, ...manualWaits, 0);

  function markServed(ticket: Ticket) {
    setTickets((current) => current.filter((item) => item.id !== ticket.id));
    setLastServed(ticket);
  }

  function undoServed() {
    if (!lastServed) return;
    setTickets((current) => [...current, lastServed]);
    selectTicket(lastServed);
    setLastServed(null);
  }

  function markReady(ticketId: number) {
    setTickets((current) => current.map((ticket) => ticket.id === ticketId ? { ...ticket, status: "ready", elapsedSeconds: 0 } : ticket));
  }

  function addTable() {
    const nextId = Math.max(...floorTables.map((table) => table.id), 0) + 1;
    const nextLabel = `${Math.max(...floorTables.map((table) => Number.parseInt(table.label, 10) || 0), 0) + 1}`;
    const table: FloorTable = { id: nextId, label: nextLabel, x: 50, y: 50, shape: addShape, seats: addShape === "round" ? 2 : addShape === "booth" ? 6 : 4, area: activeArea };
    setFloorTables((current) => [...current, table]);
    setSelectedId(nextId);
    setSelectedChairId(null);
  }

  function addBarChair() {
    const nextId = Math.max(...barChairs.map((chair) => chair.id), 0) + 1;
    const nextNumber = Math.max(...barChairs.map((chair) => Number.parseInt(chair.label.replace(/\D/g, ""), 10) || 0), 0) + 1;
    const chair: BarChair = { id: nextId, label: `B${nextNumber}`, x: 82, y: 50 };
    setBarChairs((current) => [...current, chair]);
    setSelectedChairId(nextId);
    setSelectedId(0);
  }

  function removeSelectedChair() {
    if (selectedChairId === null) return;
    setBarChairs((current) => current.filter((chair) => chair.id !== selectedChairId));
    setStatusOverrides((current) => {
      const next = { ...current };
      delete next[`chair:${selectedChairId}`];
      return next;
    });
    setSelectedChairId(null);
  }

  function updateSelectedTable(changes: Partial<FloorTable>) {
    setFloorTables((current) => current.map((table) => table.id === selectedId ? { ...table, ...changes } : table));
  }

  function updateSelectedChair(changes: Partial<BarChair>) {
    setBarChairs((current) => current.map((chair) => chair.id === selectedChairId ? { ...chair, ...changes } : chair));
  }

  function removeSelectedTable() {
    if (!selectedTable || !window.confirm(`Remove table ${selectedTable.label} from this floor layout?`)) return;
    setFloorTables((current) => current.filter((table) => table.id !== selectedId));
    setTickets((current) => current.filter((ticket) => ticket.id !== selectedId));
    setStatusOverrides((current) => {
      const next = { ...current };
      delete next[`table:${selectedId}`];
      return next;
    });
    setSelectedId(floorTables.find((table) => table.id !== selectedId)?.id ?? 0);
  }

  function resetLayout() {
    if (!window.confirm("Clear all tables and bar chairs from the floor layout?")) return;
    setFloorTables(defaultFloorTables);
    setBarChairs(defaultBarChairs);
    setStatusOverrides({});
    setSelectedId(0);
    setSelectedChairId(null);
  }

  function switchArea(area: Area) {
    setActiveArea(area);
    setSelectedChairId(null);
    const firstTable = floorTables.find((table) => table.area === area);
    setSelectedId(firstTable?.id ?? 0);
  }

  function selectTicket(ticket: Ticket) {
    if (ticket.zone === "Bar") {
      const chair = barChairs.find((item) => item.label === ticket.table);
      if (chair) {
        setActiveArea("indoor");
        setSelectedChairId(chair.id);
        setSelectedId(0);
        return;
      }
    }
    setSelectedChairId(null);
    setSelectedId(ticket.id);
  }

  function setSelectedStatus(state: ServiceState) {
    if (!selectedObjectKey) return;
    setStatusOverrides((current) => ({ ...current, [selectedObjectKey]: { state, startedAt: Date.now() } }));
  }

  function moveTable(event: React.PointerEvent<HTMLButtonElement>, tableId: number) {
    if (!editMode || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.currentTarget.dataset.dragged = "true";
    const floor = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!floor) return;
    const rawX = ((event.clientX - floor.left) / floor.width) * 100;
    const rawY = ((event.clientY - floor.top) / floor.height) * 100;
    const alignmentObjects = [
      ...floorTables.filter((table) => table.id !== tableId && table.area === activeArea),
      ...(activeArea === "indoor" ? barChairs : []),
    ];
    const snappedX = snapToObjects(rawX, alignmentObjects.map((object) => object.x));
    const snappedY = snapToObjects(rawY, alignmentObjects.map((object) => object.y));
    const x = clamp(snappedX.value, 5, 95);
    const y = clamp(snappedY.value, 7.5, 92.5);
    setSnapGuides({ x: snappedX.guide, y: snappedY.guide });
    setFloorTables((current) => current.map((table) => table.id === tableId ? { ...table, x, y } : table));
  }

  function moveBarChair(event: React.PointerEvent<HTMLButtonElement>, chairId: number) {
    if (!editMode || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.currentTarget.dataset.dragged = "true";
    const floor = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!floor) return;
    const rawX = ((event.clientX - floor.left) / floor.width) * 100;
    const rawY = ((event.clientY - floor.top) / floor.height) * 100;
    const alignmentObjects = [
      ...floorTables.filter((table) => table.area === "indoor"),
      ...barChairs.filter((chair) => chair.id !== chairId),
    ];
    const snappedX = snapToObjects(rawX, alignmentObjects.map((object) => object.x));
    const snappedY = snapToObjects(rawY, alignmentObjects.map((object) => object.y));
    const x = clamp(snappedX.value, 2.5, 97.5);
    const y = clamp(snappedY.value, 2.5, 97.5);
    setSnapGuides({ x: snappedX.guide, y: snappedY.guide });
    setBarChairs((current) => current.map((chair) => chair.id === chairId ? { ...chair, x, y } : chair));
  }

  function finishMoving() {
    setSnapGuides({ x: null, y: null });
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><img className="brand-logo" src="/mybites-logo.png" alt="" /><span>MyBites</span></div>
        <div className="shift-label"><span className="live-dot" />Friday dinner · Live floor</div>
        <div className="top-stats">
          <div><span>Ready</span><strong>{readyTickets.length}</strong></div>
          <div><span>Oldest</span><strong className={longestWait >= 600 ? "overdue" : ""}>{formatTimer(longestWait)}</strong></div>
        </div>
        <div className="clock">{clock ? formatClock(clock) : "--:--"}</div>
      </header>

      <section className="workspace">
        <div className="floor-column">
          <div className="workspace-heading">
            <div><p className="eyebrow">Live service map</p><h1>{activeArea === "indoor" ? "Indoor floor" : "Outdoor patio"}</h1></div>
            <div className="heading-actions">
            <div className="view-tabs" role="tablist" aria-label="Floor area">
              <button role="tab" aria-selected={activeArea === "indoor"} className={activeArea === "indoor" ? "active" : ""} onClick={() => switchArea("indoor")}>Indoor <span>{floorTables.filter((table) => table.area === "indoor").length + barChairs.length}</span></button>
              <button role="tab" aria-selected={activeArea === "outdoor"} className={activeArea === "outdoor" ? "active" : ""} onClick={() => switchArea("outdoor")}>Outdoor <span>{floorTables.filter((table) => table.area === "outdoor").length}</span></button>
            </div>
            <div className="map-legend" aria-label="Table status legend">
              <span><i className="key greeting" /> Needs to be greeted</span>
              <span><i className="key critical" /> Overdue</span>
              <span><i className="key late" /> Send now</span>
              <span><i className="key plating" /> Serving</span>
              <span><i className="key clear" /> Clear</span>
            </div>
            <button
              className={editMode ? "edit-floor active" : "edit-floor"}
              onClick={() => setEditMode((current) => !current)}
              aria-pressed={editMode}
              aria-label={editMode ? "Disable floor editing" : "Enable floor editing"}
              title={editMode ? "Finish editing" : "Edit floor"}
            >
              <span aria-hidden="true">{editMode ? "✓" : "✎"}</span>
              <span className="sr-only">{editMode ? "Disable editing" : "Enable editing"}</span>
            </button>
            </div>
          </div>

          {editMode && <div className="editor-bar" role="toolbar" aria-label="Floor layout editor">
            <div className="editor-intro"><strong>Layout editor</strong><span>Drag tables and chairs · Smart alignment on</span></div>
            <div className="shape-picker">
              {(["round", "square", "booth"] as Shape[]).map((shape) => <button key={shape} className={addShape === shape ? "active" : ""} onClick={() => setAddShape(shape)}><i className={`shape-icon ${shape}`} />{shape}</button>)}
            </div>
            <button className="add-table" onClick={addTable}>+ Add table</button>
            <button className="delete-table-button" onClick={removeSelectedTable} disabled={!selectedTable}>Delete selected</button>
            <button className="add-chair-button" onClick={addBarChair} disabled={activeArea !== "indoor"}>+ Add chair</button>
            <button className="delete-chair-button" onClick={removeSelectedChair} disabled={selectedChairId === null}>Delete chair</button>
            <button className="reset-layout" onClick={resetLayout}>Clear layout</button>
          </div>}

          <div className="floor-scroll">
            <section
              className={`floor-plan ${activeArea}`}
              aria-label={`${activeArea} restaurant floor plan`}
              data-editing={editMode ? "true" : "false"}
              onClick={(event) => {
                if ((event.target as HTMLElement).closest(".floor-table,.bar-chair")) return;
                setSelectedId(0);
                setSelectedChairId(null);
              }}
            >
              {activeArea === "indoor" ? <>
                <div className="floor-label dining-label">Main dining</div>
                <div className="bar-fixture"><span>BAR</span></div>
                <div className="pass-fixture"><span>Concord</span><strong>{areaReadyTickets.length}</strong><small>waiting</small></div>
                <div className="photo-desk"><span>PHOTO DESK</span></div>
              </> : <>
                <div className="floor-label patio-label">Outdoor patio</div>
                <div className="patio-service"><span>Patio</span><strong>{areaReadyTickets.length}</strong><small>waiting</small></div>
                <div className="patio-rail" />
                <div className="plant plant-one">✦</div><div className="plant plant-two">✦</div><div className="plant plant-three">✦</div>
              </>}

              {editMode && snapGuides.x !== null && <div className="snap-guide vertical" style={{ left: `${snapGuides.x}%` }} />}
              {editMode && snapGuides.y !== null && <div className="snap-guide horizontal" style={{ top: `${snapGuides.y}%` }} />}

              {activeArea === "indoor" && barChairs.map((chair) => {
                const ticket = visibleTickets.find((item) => item.zone === "Bar" && item.table === chair.label);
                const override = statusOverrides[`chair:${chair.id}`];
                const state = override?.state ?? tableState(ticket, 0);
                const elapsed = override
                  ? Math.max(0, Math.floor(((clock?.getTime() ?? override.startedAt) - override.startedAt) / 1000))
                  : ticket?.elapsedSeconds ?? 0;
                return <button
                  key={chair.id}
                  className={`bar-chair state-${state}${selectedChairId === chair.id ? " selected" : ""}`}
                  style={{ left: `${chair.x}%`, top: `${chair.y}%` }}
                  onClick={(event) => {
                    if (event.currentTarget.dataset.dragged === "true") {
                      event.currentTarget.dataset.dragged = "false";
                      return;
                    }
                    setSelectedChairId(chair.id);
                    setSelectedId(0);
                  }}
                  onPointerDown={(event) => {
                    if (!editMode) return;
                    event.preventDefault();
                    event.currentTarget.dataset.dragged = "false";
                    event.currentTarget.setPointerCapture(event.pointerId);
                  }}
                  onPointerMove={(event) => moveBarChair(event, chair.id)}
                  onPointerUp={(event) => {
                    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                    finishMoving();
                  }}
                  onPointerCancel={finishMoving}
                  aria-label={`Bar seat ${chair.label}, ${ticket ? state : "clear"}${editMode ? ", drag to move" : ""}`}
                  aria-pressed={selectedChairId === chair.id}
                  data-editing={editMode ? "true" : "false"}
                ><span>{chair.label}</span>{state !== "clear" && <small>{state === "plating" ? "S" : Math.floor(elapsed / 60)}</small>}</button>;
              })}

              {visibleFloorTables.map((table) => {
                const ticket = visibleTickets.find((item) => item.id === table.id);
                const override = statusOverrides[`table:${table.id}`];
                const state = override?.state ?? tableState(ticket, 0);
                const selected = selectedId === table.id;
                return (
                  <button
                    key={table.id}
                    className={`floor-table ${table.shape} state-${state}${selected ? " selected" : ""}`}
                    style={{ left: `${table.x}%`, top: `${table.y}%`, transform: `translate(-50%, -50%) rotate(${table.rotation ?? 0}deg)` }}
                    onClick={(event) => {
                      if (event.currentTarget.dataset.dragged === "true") {
                        event.currentTarget.dataset.dragged = "false";
                        return;
                      }
                      setSelectedId(table.id);
                      setSelectedChairId(null);
                    }}
                    onPointerDown={(event) => {
                      if (!editMode) return;
                      event.preventDefault();
                      event.currentTarget.dataset.dragged = "false";
                      event.currentTarget.setPointerCapture(event.pointerId);
                    }}
                    onPointerMove={(event) => moveTable(event, table.id)}
                    onPointerUp={(event) => {
                      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                      finishMoving();
                    }}
                    onPointerCancel={finishMoving}
                    aria-label={`Table ${table.label}, ${statusLabel(state)}`}
                    aria-pressed={selected}
                    data-editing={editMode ? "true" : "false"}
                  >
                    <span className="chair chair-a" /><span className="chair chair-b" />
                    {table.seats >= 4 && <><span className="chair chair-c" /><span className="chair chair-d" /></>}
                    <span className="table-number">{table.label}</span>
                    <span className="table-time">{override ? shortStatusLabel(state) : ticket ? ticket.status === "plating" ? "SERVING" : formatTimer(ticket.elapsedSeconds) : "CLEAR"}</span>
                  </button>
                );
              })}
            </section>
          </div>
        </div>

        {activeArea === "outdoor" && <aside className="service-rail">
          <section className="runner-queue">
            <div className="rail-heading"><div><p className="eyebrow">{activeArea} runner queue</p><h2>Ready now</h2></div><span>{areaReadyTickets.length}</span></div>
            <div className="queue-list">
              {areaReadyTickets.map((ticket, index) => <button key={ticket.id} className={`queue-item ${(selectedTicket?.id === ticket.id) ? "active" : ""}`} onClick={() => selectTicket(ticket)}>
                <span className="queue-rank">{index + 1}</span>
                <span className="queue-table"><small>Table</small><strong>{ticket.table}</strong></span>
                <span className="queue-status">{ticket.status === "plating" ? "Serving" : "Service needed"}<small>{ticket.guests} guests · {ticket.zone}</small></span>
                <strong className={`queue-time ${urgency(ticket.elapsedSeconds)}`}>{formatTimer(ticket.elapsedSeconds)}</strong>
              </button>)}
            </div>
          </section>
        </aside>}
      </section>

      {selectedObjectKey && <div className="selection-backdrop" onClick={() => { setSelectedId(0); setSelectedChairId(null); }}>
          <section className="selected-panel selection-dialog" role="dialog" aria-modal="true" aria-label={`Table ${selectedTable?.label ?? selectedChair?.label} details`} onClick={(event) => event.stopPropagation()}>
            <button className="dialog-close" onClick={() => { setSelectedId(0); setSelectedChairId(null); }} aria-label="Close table details">×</button>
            <div className="selected-header">
              <div><p>Selected table</p><h2>{selectedTable?.label ?? selectedChair?.label ?? "—"}</h2></div>
              {selectedObjectKey && <span className={`status-chip ${selectedState}`}>{statusLabel(selectedState)}{selectedState !== "clear" && ` · ${formatTimer(selectedElapsed)}`}</span>}
            </div>
            {selectedObjectKey && <div className="status-picker" aria-label="Set table status">
              <strong>Set status</strong>
              <div>{statusOptions.map((option) => <button key={option.state} className={`status-option ${option.state}${selectedState === option.state ? " active" : ""}`} onClick={() => setSelectedStatus(option.state)} aria-pressed={selectedState === option.state}><i />{option.label}</button>)}</div>
            </div>}
            {editMode && selectedTable && <div className="table-editor">
              <label>Table name<input value={selectedTable.label} maxLength={4} onChange={(event) => updateSelectedTable({ label: event.target.value })} /></label>
              <label>Seats<select value={selectedTable.seats} onChange={(event) => updateSelectedTable({ seats: Number(event.target.value) })}><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="6">6</option><option value="8">8</option></select></label>
              <label>Shape<select value={selectedTable.shape} onChange={(event) => updateSelectedTable({ shape: event.target.value as Shape })}><option value="round">Round</option><option value="square">Square</option><option value="booth">Booth</option></select></label>
              <label>Area<select value={selectedTable.area} onChange={(event) => { const area = event.target.value as Area; updateSelectedTable({ area }); setActiveArea(area); }}><option value="indoor">Indoor</option><option value="outdoor">Outdoor</option></select></label>
              <button className="remove-table" onClick={removeSelectedTable}>Remove table</button>
              <p>Changes save automatically on this device.</p>
            </div>}
            {editMode && selectedChair && <div className="table-editor chair-editor">
              <label>Bar seat name<input value={selectedChair.label} maxLength={4} onChange={(event) => updateSelectedChair({ label: event.target.value })} /></label>
              <button className="remove-table" onClick={removeSelectedChair}>Remove chair</button>
              <p>Chair positions and names save automatically.</p>
            </div>}
            {selectedState !== "clear" ? <>
              {selectedTicket && <div className="selected-meta"><span>{selectedTicket.guests} guests</span><span>{selectedTicket.zone}</span></div>}
              {!selectedTicket && <div className="manual-status-summary"><strong>{statusLabel(selectedState)}</strong><span>Status set for this table</span></div>}
              {selectedTicket && (selectedTicket.status === "ready" ? <button className="primary-action" onClick={() => markServed(selectedTicket)}>✓ Mark table served</button> : <button className="primary-action plating-action" onClick={() => markReady(selectedTicket.id)}>Move to ready</button>)}
            </> : <div className="clear-table"><span>✓</span><h3>Table is clear</h3><p>No service tasks are waiting for this table.</p></div>}
          </section>
      </div>}

      {lastServed && <div className="toast" role="status"><span>Table {lastServed.table} served</span><button onClick={undoServed}>Undo</button><button className="toast-close" onClick={() => setLastServed(null)}>×</button></div>}
    </main>
  );
}
