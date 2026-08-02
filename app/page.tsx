"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  type Area,
  type BarChair,
  type FloorTable,
  type ServiceState,
  type Shape,
  type SharedFloorState,
  type StateOperation,
  type StatusOverride,
  savedBarChairs,
  savedFloorTables,
} from "@/lib/live-state";

type TicketStatus = "ready" | "plating";
type Zone = "Dining room" | "Patio" | "Bar";
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

const initialTickets: Ticket[] = [];
const defaultFloorTables: FloorTable[] = [];
const defaultBarChairs: BarChair[] = [];

const migratedOutdoorPositions: Record<number, { x: number; y: number }> = {
  10: { x: 19, y: 31 }, 11: { x: 43, y: 31 }, 12: { x: 67, y: 31 }, 7: { x: 42, y: 67 },
};

const statusOptions: Array<{ state: ServiceState; label: string; shortLabel: string }> = [
  { state: "fresh", label: "Needs to be greeted", shortLabel: "GREET" },
  { state: "late", label: "Ready to fly", shortLabel: "FLY" },
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

function formatShiftLabel(date: Date) {
  const service = date.getHours() >= 16 ? "dinner" : "lunch";
  return `${date.toLocaleDateString([], { weekday: "long" })} ${service}`;
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

function currentTimestamp() {
  return Date.now();
}

function createObjectId() {
  return currentTimestamp() * 1000 + Math.floor(Math.random() * 1000);
}

function hasPreviousIndoorOrientation(state: SharedFloorState) {
  const firstTable = state.floorTables.find((table) => table.label === "1");
  const lastTable = state.floorTables.find((table) => table.label === "11");
  const firstChair = state.barChairs.find((chair) => chair.label === "B1");
  return state.floorTables.length === 11
    && state.barChairs.length === 10
    && firstTable?.x === 72.5
    && firstTable.y === 22.5
    && lastTable?.x === 47.5
    && lastTable.y === 87.5
    && firstChair?.x === 82.5
    && firstChair.y === 15;
}

function readLegacyState() {
  try {
    const floorTables = JSON.parse(window.localStorage.getItem("pass-floor-layout") ?? "[]") as FloorTable[];
    const barChairs = JSON.parse(window.localStorage.getItem("pass-bar-chairs") ?? "[]") as BarChair[];
    const statusOverrides = JSON.parse(window.localStorage.getItem("mybites-table-statuses") ?? "{}") as Record<string, StatusOverride>;
    return { floorTables, barChairs, statusOverrides };
  } catch {
    return { floorTables: [], barChairs: [], statusOverrides: {} };
  }
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
  const [syncStatus, setSyncStatus] = useState<"connecting" | "live" | "syncing" | "offline">("connecting");
  const [addShape, setAddShape] = useState<Shape>("round");
  const [activeArea, setActiveArea] = useState<Area>("indoor");
  const [snapGuides, setSnapGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
  const floorTablesRef = useRef(floorTables);
  const barChairsRef = useRef(barChairs);
  const statusOverridesRef = useRef(statusOverrides);
  const pendingMutationsRef = useRef(0);
  const draggingRef = useRef(false);

  function applyRemoteState(sharedState: SharedFloorState) {
    if (draggingRef.current) return;
    const migratedTables = sharedState.floorTables.map((table) => {
      if (table.area) return table;
      const outdoorPosition = migratedOutdoorPositions[table.id];
      return { ...table, area: outdoorPosition ? "outdoor" as const : "indoor" as const, ...(outdoorPosition ?? {}) };
    });
    const migratedChairs = sharedState.barChairs.map((chair, index) => ({ ...chair, label: chair.label ?? `B${index + 1}` }));
    const migratedStatuses = Object.fromEntries(Object.entries(sharedState.statusOverrides).map(([key, value]) => [key, value.state === "watch" ? { ...value, state: "late" as const } : value]));
    floorTablesRef.current = migratedTables;
    barChairsRef.current = migratedChairs;
    statusOverridesRef.current = migratedStatuses;
    setFloorTables(migratedTables);
    setBarChairs(migratedChairs);
    setStatusOverrides(migratedStatuses);
  }

  useEffect(() => {
    setClock(new Date());
    const interval = window.setInterval(() => {
      setTick((value) => value + 1);
      setClock(new Date());
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let active = true;

    async function refreshSharedState(initial = false) {
      if (pendingMutationsRef.current > 0 || draggingRef.current) return;
      try {
        const response = await fetch("/api/state", { cache: "no-store" });
        if (!response.ok) throw new Error("Shared floor unavailable");
        let sharedState = await response.json() as SharedFloorState;
        if (initial && sharedState.version === 0 && sharedState.floorTables.length === 0 && sharedState.barChairs.length === 0) {
          const legacyState = readLegacyState();
          if (legacyState.floorTables.length > 0 || legacyState.barChairs.length > 0 || Object.keys(legacyState.statusOverrides).length > 0) {
            const bootstrapResponse = await fetch("/api/state", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ type: "bootstrap", state: legacyState } satisfies StateOperation),
            });
            if (bootstrapResponse.ok) sharedState = await bootstrapResponse.json() as SharedFloorState;
          }
        }
        if (initial && hasPreviousIndoorOrientation(sharedState)) {
          const migratedFloorTables = sharedState.floorTables.map((table) => {
            const savedTable = savedFloorTables.find((candidate) => candidate.label === table.label);
            return savedTable ? { ...table, x: savedTable.x, y: savedTable.y, rotation: savedTable.rotation } : table;
          });
          const migratedBarChairs = sharedState.barChairs.map((chair) => {
            const savedChair = savedBarChairs.find((candidate) => candidate.label === chair.label);
            return savedChair ? { ...chair, x: savedChair.x, y: savedChair.y } : chair;
          });
          const migrationResponse = await fetch("/api/state", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "replaceLayout", floorTables: migratedFloorTables, barChairs: migratedBarChairs } satisfies StateOperation),
          });
          if (migrationResponse.ok) sharedState = await migrationResponse.json() as SharedFloorState;
        }
        if (!active) return;
        applyRemoteState(sharedState);
        setSyncStatus("live");
      } catch {
        if (active) setSyncStatus("offline");
      }
    }

    void refreshSharedState(true);
    const interval = window.setInterval(() => void refreshSharedState(), 1000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  function commitOperation(operation: StateOperation) {
    pendingMutationsRef.current += 1;
    setSyncStatus("syncing");
    void fetch("/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(operation),
    }).then(async (response) => {
      if (!response.ok) throw new Error("Update failed");
      applyRemoteState(await response.json() as SharedFloorState);
      setSyncStatus("live");
    }).catch(() => {
      setSyncStatus("offline");
    }).finally(() => {
      pendingMutationsRef.current = Math.max(0, pendingMutationsRef.current - 1);
    });
  }

  const visibleTickets = useMemo(() => tickets.map((ticket) => ({ ...ticket, elapsedSeconds: ticket.elapsedSeconds + tick })), [tickets, tick]);
  const readyTickets = visibleTickets.filter((ticket) => ticket.status === "ready").sort((a, b) => b.elapsedSeconds - a.elapsedSeconds);
  const visibleFloorTables = floorTables.filter((table) => table.area === activeArea);
  const areaReadyTickets = readyTickets.filter((ticket) => activeArea === "outdoor" ? ticket.zone === "Patio" : ticket.zone !== "Patio");
  const manualReadyStatuses = Object.entries(statusOverrides).filter(([, status]) => status.state === "late" || status.state === "critical");
  const areaManualReadyCount = manualReadyStatuses.filter(([objectKey]) => {
    const [objectType, objectId] = objectKey.split(":");
    if (objectType === "chair") return activeArea === "indoor";
    const table = floorTables.find((candidate) => String(candidate.id) === objectId);
    return table?.area === activeArea;
  }).length;
  const totalReadyCount = readyTickets.length + manualReadyStatuses.length;
  const areaWaitingCount = areaReadyTickets.length + areaManualReadyCount;
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
  const manualReadyWaits = manualReadyStatuses.map(([, status]) => Math.max(0, Math.floor(((clock?.getTime() ?? status.startedAt) - status.startedAt) / 1000)));
  const longestWait = Math.max(readyTickets[0]?.elapsedSeconds ?? 0, ...manualReadyWaits, 0);

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
    const nextId = createObjectId();
    const nextLabel = `${Math.max(...floorTablesRef.current.map((table) => Number.parseInt(table.label, 10) || 0), 0) + 1}`;
    const table: FloorTable = { id: nextId, label: nextLabel, x: 50, y: 50, shape: addShape, seats: addShape === "round" ? 2 : addShape === "booth" ? 6 : 4, area: activeArea, rotation: activeArea === "indoor" ? 90 : 0 };
    floorTablesRef.current = [...floorTablesRef.current, table];
    setFloorTables(floorTablesRef.current);
    commitOperation({ type: "upsertTable", table });
    setSelectedId(nextId);
    setSelectedChairId(null);
  }

  function addBarChair() {
    const nextId = createObjectId();
    const nextNumber = Math.max(...barChairsRef.current.map((chair) => Number.parseInt(chair.label.replace(/\D/g, ""), 10) || 0), 0) + 1;
    const chair: BarChair = { id: nextId, label: `B${nextNumber}`, x: 50, y: 82.5 };
    barChairsRef.current = [...barChairsRef.current, chair];
    setBarChairs(barChairsRef.current);
    commitOperation({ type: "upsertChair", chair });
    setSelectedChairId(nextId);
    setSelectedId(0);
  }

  function removeSelectedChair() {
    if (selectedChairId === null) return;
    barChairsRef.current = barChairsRef.current.filter((chair) => chair.id !== selectedChairId);
    setBarChairs(barChairsRef.current);
    const nextStatuses = { ...statusOverridesRef.current };
    delete nextStatuses[`chair:${selectedChairId}`];
    statusOverridesRef.current = nextStatuses;
    setStatusOverrides(nextStatuses);
    commitOperation({ type: "deleteChair", chairId: selectedChairId });
    setSelectedChairId(null);
  }

  function updateSelectedTable(changes: Partial<FloorTable>) {
    const table = floorTablesRef.current.find((item) => item.id === selectedId);
    if (!table) return;
    const updatedTable = { ...table, ...changes };
    floorTablesRef.current = floorTablesRef.current.map((item) => item.id === selectedId ? updatedTable : item);
    setFloorTables(floorTablesRef.current);
    commitOperation({ type: "upsertTable", table: updatedTable });
  }

  function updateSelectedChair(changes: Partial<BarChair>) {
    const chair = barChairsRef.current.find((item) => item.id === selectedChairId);
    if (!chair) return;
    const updatedChair = { ...chair, ...changes };
    barChairsRef.current = barChairsRef.current.map((item) => item.id === selectedChairId ? updatedChair : item);
    setBarChairs(barChairsRef.current);
    commitOperation({ type: "upsertChair", chair: updatedChair });
  }

  function removeSelectedTable() {
    if (!selectedTable || !window.confirm(`Remove table ${selectedTable.label} from this floor layout?`)) return;
    floorTablesRef.current = floorTablesRef.current.filter((table) => table.id !== selectedId);
    setFloorTables(floorTablesRef.current);
    setTickets((current) => current.filter((ticket) => ticket.id !== selectedId));
    const nextStatuses = { ...statusOverridesRef.current };
    delete nextStatuses[`table:${selectedId}`];
    statusOverridesRef.current = nextStatuses;
    setStatusOverrides(nextStatuses);
    commitOperation({ type: "deleteTable", tableId: selectedId });
    setSelectedId(floorTablesRef.current[0]?.id ?? 0);
  }

  function resetLayout() {
    if (!window.confirm("Clear all tables and bar chairs from the floor layout?")) return;
    floorTablesRef.current = defaultFloorTables;
    barChairsRef.current = defaultBarChairs;
    statusOverridesRef.current = {};
    setFloorTables(floorTablesRef.current);
    setBarChairs(barChairsRef.current);
    setStatusOverrides(statusOverridesRef.current);
    commitOperation({ type: "clearAll" });
    setSelectedId(0);
    setSelectedChairId(null);
  }

  function switchArea(area: Area) {
    setActiveArea(area);
    setSelectedChairId(null);
    setSelectedId(0);
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
    const status = { state, startedAt: currentTimestamp() };
    statusOverridesRef.current = { ...statusOverridesRef.current, [selectedObjectKey]: status };
    setStatusOverrides(statusOverridesRef.current);
    commitOperation({ type: "setStatus", objectKey: selectedObjectKey, status });
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
    floorTablesRef.current = floorTablesRef.current.map((table) => table.id === tableId ? { ...table, x, y } : table);
    setFloorTables(floorTablesRef.current);
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
    barChairsRef.current = barChairsRef.current.map((chair) => chair.id === chairId ? { ...chair, x, y } : chair);
    setBarChairs(barChairsRef.current);
  }

  function finishMoving(type?: "table" | "chair", id?: number) {
    draggingRef.current = false;
    setSnapGuides({ x: null, y: null });
    if (type === "table") {
      const table = floorTablesRef.current.find((item) => item.id === id);
      if (table) commitOperation({ type: "upsertTable", table });
    }
    if (type === "chair") {
      const chair = barChairsRef.current.find((item) => item.id === id);
      if (chair) commitOperation({ type: "upsertChair", chair });
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><img className="brand-logo" src="/mybites-logo.png" alt="" /><span>MyBites</span></div>
        <div className={`shift-label sync-${syncStatus}`}><span className="live-dot" />{clock ? formatShiftLabel(clock) : "Service"} · <span className="sync-copy">{syncStatus === "live" ? "Live on all devices" : syncStatus === "syncing" ? "Saving for everyone" : syncStatus === "offline" ? "Reconnecting" : "Connecting"}</span></div>
        <div className="top-stats">
          <div><span>Ready to fly</span><strong>{totalReadyCount}</strong></div>
          <div><span>Oldest</span><strong className={longestWait >= 600 ? "overdue" : ""}>{formatTimer(longestWait)}</strong></div>
        </div>
        <div className="clock">{clock ? formatClock(clock) : "--:--"}</div>
      </header>

      <section className="workspace">
        <div className="floor-column">
          <div className="workspace-heading">
            <div><p className="eyebrow">Live service map</p><h1>{activeArea === "indoor" ? "Indoor floor" : "Outdoor floor"}</h1></div>
            <div className="heading-actions">
            <div className="view-tabs" role="tablist" aria-label="Floor area">
              <button role="tab" aria-selected={activeArea === "indoor"} className={activeArea === "indoor" ? "active" : ""} onClick={() => switchArea("indoor")}>Indoor <span>{floorTables.filter((table) => table.area === "indoor").length + barChairs.length}</span></button>
              <button role="tab" aria-selected={activeArea === "outdoor"} className={activeArea === "outdoor" ? "active" : ""} onClick={() => switchArea("outdoor")}>Outdoor <span>{floorTables.filter((table) => table.area === "outdoor").length}</span></button>
            </div>
            <div className="map-legend" aria-label="Table status legend">
              <span><i className="key greeting" /> Needs to be greeted</span>
              <span><i className="key critical" /> Overdue</span>
              <span><i className="key late" /> Ready to fly</span>
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
                <div className="bar-fixture"><span>BAR</span></div>
                <div className="pass-fixture"><span>Indoor</span><strong>{areaWaitingCount}</strong><small>waiting</small></div>
                <div className="photo-desk"><span>PHOTO DESK</span></div>
              </> : <>
                <div className="patio-service"><span>Patio</span><strong>{areaWaitingCount}</strong><small>waiting</small></div>
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
                    draggingRef.current = true;
                    event.currentTarget.dataset.dragged = "false";
                    event.currentTarget.setPointerCapture(event.pointerId);
                  }}
                  onPointerMove={(event) => moveBarChair(event, chair.id)}
                  onPointerUp={(event) => {
                    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                    finishMoving("chair", chair.id);
                  }}
                  onPointerCancel={() => finishMoving()}
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
                    style={{
                      left: `${table.x}%`,
                      top: `${table.y}%`,
                      transform: `translate(-50%, -50%) rotate(${table.rotation ?? 0}deg) scale(var(--floor-object-scale, 1))`,
                      "--table-counter-rotation": `${-(table.rotation ?? 0)}deg`,
                    } as React.CSSProperties & Record<"--table-counter-rotation", string>}
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
                      draggingRef.current = true;
                      event.currentTarget.dataset.dragged = "false";
                      event.currentTarget.setPointerCapture(event.pointerId);
                    }}
                    onPointerMove={(event) => moveTable(event, table.id)}
                    onPointerUp={(event) => {
                      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                      finishMoving("table", table.id);
                    }}
                    onPointerCancel={() => finishMoving()}
                    aria-label={`Table ${table.label}, ${statusLabel(state)}`}
                    aria-pressed={selected}
                    data-editing={editMode ? "true" : "false"}
                  >
                    <span className="chair chair-a" /><span className="chair chair-b" />
                    {table.seats >= 4 && <><span className="chair chair-c" /><span className="chair chair-d" /></>}
                    <span className="table-copy">
                      <span className="table-number">{table.label}</span>
                      <span className="table-time">{override ? shortStatusLabel(state) : ticket ? ticket.status === "plating" ? "SERVING" : formatTimer(ticket.elapsedSeconds) : "CLEAR"}</span>
                    </span>
                  </button>
                );
              })}

              {selectedObjectKey && (selectedTable || selectedChair) && <section
                className={`selected-panel selection-dialog floor-popover ${((selectedTable?.x ?? selectedChair?.x ?? 50) > 58) ? "opens-left" : "opens-right"}`}
                role="dialog"
                aria-label={`Table ${selectedTable?.label ?? selectedChair?.label} details`}
                style={{
                  left: `clamp(200px, calc(${selectedTable?.x ?? selectedChair?.x ?? 50}% + ${((selectedTable?.x ?? selectedChair?.x ?? 50) > 58) ? -220 : 220}px), calc(100% - 200px))`,
                  top: `clamp(185px, ${selectedTable?.y ?? selectedChair?.y ?? 50}%, calc(100% - 185px))`,
                }}
                onClick={(event) => event.stopPropagation()}
              >
                <button className="dialog-close" onClick={() => { setSelectedId(0); setSelectedChairId(null); }} aria-label="Close table details">×</button>
                <div className="selected-header">
                  <div><p>Selected table</p><h2>{selectedTable?.label ?? selectedChair?.label ?? "—"}</h2></div>
                  <span className={`status-chip ${selectedState}`}>{statusLabel(selectedState)}{selectedState !== "clear" && ` · ${formatTimer(selectedElapsed)}`}</span>
                </div>
                <div className="status-picker" aria-label="Set table status">
                  <strong>Set status</strong>
                  <div>{statusOptions.map((option) => <button key={option.state} className={`status-option ${option.state}${selectedState === option.state ? " active" : ""}`} onClick={() => setSelectedStatus(option.state)} aria-pressed={selectedState === option.state}><i />{option.label}</button>)}</div>
                </div>
                {editMode && selectedTable && <div className="table-editor">
                  <label>Table name<input value={selectedTable.label} maxLength={4} onChange={(event) => updateSelectedTable({ label: event.target.value })} /></label>
                  <label>Seats<select value={selectedTable.seats} onChange={(event) => updateSelectedTable({ seats: Number(event.target.value) })}><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="6">6</option><option value="8">8</option></select></label>
                  <label>Shape<select value={selectedTable.shape} onChange={(event) => updateSelectedTable({ shape: event.target.value as Shape })}><option value="round">Round</option><option value="square">Square</option><option value="booth">Booth</option></select></label>
                  <label>Area<select value={selectedTable.area} onChange={(event) => { const area = event.target.value as Area; updateSelectedTable({ area }); setActiveArea(area); }}><option value="indoor">Indoor</option><option value="outdoor">Outdoor</option></select></label>
                  <button className="remove-table" onClick={removeSelectedTable}>Remove table</button>
                  <p>Changes save automatically for everyone.</p>
                </div>}
                {editMode && selectedChair && <div className="table-editor chair-editor">
                  <label>Bar seat name<input value={selectedChair.label} maxLength={4} onChange={(event) => updateSelectedChair({ label: event.target.value })} /></label>
                  <button className="remove-table" onClick={removeSelectedChair}>Remove chair</button>
                  <p>Chair positions and names save automatically for everyone.</p>
                </div>}
                {selectedState !== "clear" ? <>
                  {selectedTicket && <div className="selected-meta"><span>{selectedTicket.guests} guests</span><span>{selectedTicket.zone}</span></div>}
                  {!selectedTicket && <div className="manual-status-summary"><strong>{statusLabel(selectedState)}</strong><span>Status set for this table</span></div>}
                  {selectedTicket && (selectedTicket.status === "ready" ? <button className="primary-action" onClick={() => markServed(selectedTicket)}>✓ Mark table served</button> : <button className="primary-action plating-action" onClick={() => markReady(selectedTicket.id)}>Move to ready</button>)}
                </> : <div className="clear-table"><span>✓</span><h3>Table is clear</h3><p>No service tasks are waiting for this table.</p></div>}
              </section>}
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

      {lastServed && <div className="toast" role="status"><span>Table {lastServed.table} served</span><button onClick={undoServed}>Undo</button><button className="toast-close" onClick={() => setLastServed(null)}>×</button></div>}
    </main>
  );
}
