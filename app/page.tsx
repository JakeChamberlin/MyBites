"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  type Area,
  type BarChair,
  type DailyServiceMetrics,
  type FloorObject,
  type FloorObjectType,
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
  { state: "postflight", label: "Post Flight", shortLabel: "POST" },
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

function serviceDayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const emptyDailyService: DailyServiceMetrics = { dayKey: "", customersServed: 0, completedServices: 0, totalWaitSeconds: 0, greetingServingSeconds: 0, greetingServingSamples: 0, readyToFlySeconds: 0, readyToFlySamples: 0 };

function waitCategory(state: ServiceState) {
  if (state === "late" || state === "critical") return "ready";
  if (state === "fresh" || state === "watch" || state === "plating") return "service";
  return null;
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
  const [floorObjects, setFloorObjects] = useState<FloorObject[]>([]);
  const [statusOverrides, setStatusOverrides] = useState<Record<string, StatusOverride>>({});
  const [dailyService, setDailyService] = useState<DailyServiceMetrics>(emptyDailyService);
  const [selectedChairId, setSelectedChairId] = useState<number | null>(null);
  const [selectedFloorObjectId, setSelectedFloorObjectId] = useState<number | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"connecting" | "live" | "syncing" | "offline">("connecting");
  const [addShape, setAddShape] = useState<Shape>("round");
  const [addObjectType, setAddObjectType] = useState<FloorObjectType>("bush");
  const [activeArea, setActiveArea] = useState<Area>("indoor");
  const [flippedViews, setFlippedViews] = useState<Record<Area, boolean>>({ indoor: false, outdoor: false });
  const [rotationAnimating, setRotationAnimating] = useState(false);
  const [snapGuides, setSnapGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
  const floorTablesRef = useRef(floorTables);
  const barChairsRef = useRef(barChairs);
  const floorObjectsRef = useRef(floorObjects);
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
    const migratedObjects = sharedState.floorObjects ?? [];
    const migratedStatuses = Object.fromEntries(Object.entries(sharedState.statusOverrides).map(([key, value]) => [key, value.state === "watch" ? { ...value, state: "late" as const } : value]));
    floorTablesRef.current = migratedTables;
    barChairsRef.current = migratedChairs;
    floorObjectsRef.current = migratedObjects;
    statusOverridesRef.current = migratedStatuses;
    setFloorTables(migratedTables);
    setBarChairs(migratedChairs);
    setFloorObjects(migratedObjects);
    setStatusOverrides(migratedStatuses);
    setDailyService(sharedState.dailyService);
  }

  useEffect(() => {
    setClock(new Date());
    const previousViewSetting = window.localStorage.getItem("mybites-view-flipped") === "true";
    setFlippedViews({
      indoor: window.localStorage.getItem("mybites-view-flipped-indoor") === "true" || (window.localStorage.getItem("mybites-view-flipped-indoor") === null && previousViewSetting),
      outdoor: window.localStorage.getItem("mybites-view-flipped-outdoor") === "true" || (window.localStorage.getItem("mybites-view-flipped-outdoor") === null && previousViewSetting),
    });
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
        if (initial && sharedState.floorTables.some((table) => table.shape === "booth" && table.seats !== 4)) {
          const boothMigrationResponse = await fetch("/api/state", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "replaceLayout",
              floorTables: sharedState.floorTables.map((table) => table.shape === "booth" ? { ...table, seats: 4 } : table),
              barChairs: sharedState.barChairs,
            } satisfies StateOperation),
          });
          if (boothMigrationResponse.ok) sharedState = await boothMigrationResponse.json() as SharedFloorState;
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
  const visibleFloorObjects = floorObjects.filter((object) => object.area === activeArea);
  const areaReadyTickets = readyTickets.filter((ticket) => activeArea === "outdoor" ? ticket.zone === "Patio" : ticket.zone !== "Patio");
  const manualReadyStatuses = Object.entries(statusOverrides).filter(([, status]) => status.state === "late" || status.state === "critical");
  const manualStatusArea = (objectKey: string): Area | undefined => {
    const [objectType, objectId] = objectKey.split(":");
    if (objectType === "chair") return "indoor";
    return floorTables.find((candidate) => String(candidate.id) === objectId)?.area;
  };
  const areaManualReadyCount = manualReadyStatuses.filter(([objectKey]) => {
    return manualStatusArea(objectKey) === activeArea;
  }).length;
  const outdoorReadyCount = readyTickets.filter((ticket) => ticket.zone === "Patio").length
    + manualReadyStatuses.filter(([objectKey]) => manualStatusArea(objectKey) === "outdoor").length;
  const totalReadyCount = readyTickets.length + manualReadyStatuses.length;
  const areaWaitingCount = areaReadyTickets.length + areaManualReadyCount;
  const selectedTable = floorTables.find((table) => table.id === selectedId);
  const selectedChair = barChairs.find((chair) => chair.id === selectedChairId);
  const selectedFloorObject = floorObjects.find((object) => object.id === selectedFloorObjectId);
  const viewFlipped = flippedViews[activeArea];
  const selectedFloorX = selectedTable?.x ?? selectedChair?.x ?? 50;
  const selectedFloorY = selectedTable?.y ?? selectedChair?.y ?? 50;
  const selectedViewX = viewFlipped ? 100 - selectedFloorX : selectedFloorX;
  const selectedViewY = viewFlipped ? 100 - selectedFloorY : selectedFloorY;
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
  const currentDayKey = clock ? serviceDayKey(clock) : dailyService.dayKey;
  const todayService = dailyService.dayKey === currentDayKey ? dailyService : emptyDailyService;
  const averageGreetingServing = todayService.greetingServingSamples > 0 ? Math.round(todayService.greetingServingSeconds / todayService.greetingServingSamples) : 0;
  const averageReadyToFly = todayService.readyToFlySamples > 0 ? Math.round(todayService.readyToFlySeconds / todayService.readyToFlySamples) : 0;

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
    const table: FloorTable = { id: nextId, label: nextLabel, x: 50, y: 50, shape: addShape, seats: addShape === "round" ? 2 : 4, area: activeArea, rotation: activeArea === "indoor" ? 90 : 0 };
    floorTablesRef.current = [...floorTablesRef.current, table];
    setFloorTables(floorTablesRef.current);
    commitOperation({ type: "upsertTable", table });
    setSelectedId(nextId);
    setSelectedChairId(null);
    setSelectedFloorObjectId(null);
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
    setSelectedFloorObjectId(null);
  }

  function addFloorObject() {
    const object: FloorObject = { id: createObjectId(), type: addObjectType, x: 50, y: 50, area: activeArea, rotation: 0 };
    floorObjectsRef.current = [...floorObjectsRef.current, object];
    setFloorObjects(floorObjectsRef.current);
    commitOperation({ type: "upsertObject", object });
    setSelectedFloorObjectId(object.id);
    setSelectedId(0);
    setSelectedChairId(null);
  }

  function removeSelectedFloorObject() {
    if (selectedFloorObjectId === null) return;
    floorObjectsRef.current = floorObjectsRef.current.filter((object) => object.id !== selectedFloorObjectId);
    setFloorObjects(floorObjectsRef.current);
    commitOperation({ type: "deleteObject", objectId: selectedFloorObjectId });
    setSelectedFloorObjectId(null);
  }

  function rotateSelectedFloorObject() {
    if (!selectedFloorObject) return;
    const object = { ...selectedFloorObject, rotation: ((selectedFloorObject.rotation ?? 0) + 90) % 360 };
    floorObjectsRef.current = floorObjectsRef.current.map((item) => item.id === object.id ? object : item);
    setFloorObjects(floorObjectsRef.current);
    commitOperation({ type: "upsertObject", object });
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

  function renameSelectedTable() {
    if (!selectedTable) return;
    const label = window.prompt("Enter a new table name", selectedTable.label)?.trim();
    if (!label || label === selectedTable.label) return;
    updateSelectedTable({ label: label.slice(0, 4) });
  }

  function rotateSelectedTable() {
    if (!selectedTable) return;
    updateSelectedTable({ rotation: ((selectedTable.rotation ?? 0) + 90) % 360 });
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
    if (!window.confirm("Clear all tables, chairs, and objects from the floor layout?")) return;
    floorTablesRef.current = defaultFloorTables;
    barChairsRef.current = defaultBarChairs;
    floorObjectsRef.current = [];
    statusOverridesRef.current = {};
    setFloorTables(floorTablesRef.current);
    setBarChairs(barChairsRef.current);
    setFloorObjects(floorObjectsRef.current);
    setStatusOverrides(statusOverridesRef.current);
    commitOperation({ type: "clearAll" });
    setSelectedId(0);
    setSelectedChairId(null);
    setSelectedFloorObjectId(null);
  }

  function resetDailyService() {
    if (!window.confirm("Reset customers served and average wait to zero for today?")) return;
    commitOperation({ type: "resetDailyService", dayKey: serviceDayKey(new Date()) });
  }

  function toggleViewRotation() {
    setRotationAnimating(true);
    setFlippedViews((current) => {
      const next = { ...current, [activeArea]: !current[activeArea] };
      window.localStorage.setItem(`mybites-view-flipped-${activeArea}`, String(next[activeArea]));
      return next;
    });
  }

  function switchArea(area: Area) {
    setRotationAnimating(false);
    setActiveArea(area);
    setSelectedChairId(null);
    setSelectedId(0);
    setSelectedFloorObjectId(null);
  }

  function selectTicket(ticket: Ticket) {
    if (ticket.zone === "Bar") {
      const chair = barChairs.find((item) => item.label === ticket.table);
      if (chair) {
        setActiveArea("indoor");
        setSelectedChairId(chair.id);
        setSelectedId(0);
        setSelectedFloorObjectId(null);
        return;
      }
    }
    setSelectedChairId(null);
    setSelectedId(ticket.id);
    setSelectedFloorObjectId(null);
  }

  function setSelectedStatus(state: ServiceState) {
    if (!selectedObjectKey) return;
    if (state === selectedState) return;
    if (state === "clear" && selectedState !== "clear") {
      const customers = selectedChair ? 1 : selectedTable?.seats ?? 1;
      commitOperation({ type: "completeService", objectKey: selectedObjectKey, dayKey: serviceDayKey(new Date()), customers });
      return;
    }
    const now = currentTimestamp();
    const status = {
      state,
      startedAt: now,
      serviceStartedAt: selectedOverride && selectedOverride.state !== "clear" ? selectedOverride.serviceStartedAt ?? selectedOverride.startedAt : now,
      categoryStartedAt: selectedOverride && waitCategory(selectedOverride.state) === waitCategory(state)
        ? selectedOverride.categoryStartedAt ?? selectedOverride.startedAt
        : now,
    };
    statusOverridesRef.current = { ...statusOverridesRef.current, [selectedObjectKey]: status };
    setStatusOverrides(statusOverridesRef.current);
    commitOperation({ type: "setStatus", objectKey: selectedObjectKey, dayKey: serviceDayKey(new Date()), status });
  }

  function moveTable(event: React.PointerEvent<HTMLButtonElement>, tableId: number) {
    if (!editMode || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.currentTarget.dataset.dragged = "true";
    const floor = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!floor) return;
    const pointerX = ((event.clientX - floor.left) / floor.width) * 100;
    const pointerY = ((event.clientY - floor.top) / floor.height) * 100;
    const rawX = viewFlipped ? 100 - pointerX : pointerX;
    const rawY = viewFlipped ? 100 - pointerY : pointerY;
    const alignmentObjects = [
      ...floorTables.filter((table) => table.id !== tableId && table.area === activeArea),
      ...(activeArea === "indoor" ? barChairs : []),
      ...visibleFloorObjects,
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
    const pointerX = ((event.clientX - floor.left) / floor.width) * 100;
    const pointerY = ((event.clientY - floor.top) / floor.height) * 100;
    const rawX = viewFlipped ? 100 - pointerX : pointerX;
    const rawY = viewFlipped ? 100 - pointerY : pointerY;
    const alignmentObjects = [
      ...floorTables.filter((table) => table.area === "indoor"),
      ...barChairs.filter((chair) => chair.id !== chairId),
      ...floorObjects.filter((object) => object.area === "indoor"),
    ];
    const snappedX = snapToObjects(rawX, alignmentObjects.map((object) => object.x));
    const snappedY = snapToObjects(rawY, alignmentObjects.map((object) => object.y));
    const x = clamp(snappedX.value, 2.5, 97.5);
    const y = clamp(snappedY.value, 2.5, 97.5);
    setSnapGuides({ x: snappedX.guide, y: snappedY.guide });
    barChairsRef.current = barChairsRef.current.map((chair) => chair.id === chairId ? { ...chair, x, y } : chair);
    setBarChairs(barChairsRef.current);
  }

  function moveFloorObject(event: React.PointerEvent<HTMLButtonElement>, objectId: number) {
    if (!editMode || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.currentTarget.dataset.dragged = "true";
    const floor = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!floor) return;
    const pointerX = ((event.clientX - floor.left) / floor.width) * 100;
    const pointerY = ((event.clientY - floor.top) / floor.height) * 100;
    const rawX = viewFlipped ? 100 - pointerX : pointerX;
    const rawY = viewFlipped ? 100 - pointerY : pointerY;
    const alignmentObjects = [
      ...floorTables.filter((table) => table.area === activeArea),
      ...(activeArea === "indoor" ? barChairs : []),
      ...floorObjects.filter((object) => object.id !== objectId && object.area === activeArea),
    ];
    const snappedX = snapToObjects(rawX, alignmentObjects.map((object) => object.x));
    const snappedY = snapToObjects(rawY, alignmentObjects.map((object) => object.y));
    const x = clamp(snappedX.value, 2.5, 97.5);
    const y = clamp(snappedY.value, 2.5, 97.5);
    setSnapGuides({ x: snappedX.guide, y: snappedY.guide });
    floorObjectsRef.current = floorObjectsRef.current.map((object) => object.id === objectId ? { ...object, x, y } : object);
    setFloorObjects(floorObjectsRef.current);
  }

  function finishMoving(type?: "table" | "chair" | "object", id?: number) {
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
    if (type === "object") {
      const object = floorObjectsRef.current.find((item) => item.id === id);
      if (object) commitOperation({ type: "upsertObject", object });
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
            <div className="floor-title"><p className="eyebrow">Live service map</p><div className="floor-title-row"><h1>{activeArea === "indoor" ? "Indoor floor" : "Outdoor floor"}</h1><div className="daily-summary" aria-label="Today's service totals"><span><small>Customers served</small><strong>{todayService.customersServed}</strong></span><span><small>Greet / serving avg</small><strong>{formatTimer(averageGreetingServing)}</strong></span><span><small>Ready to fly avg</small><strong>{formatTimer(averageReadyToFly)}</strong></span></div></div></div>
            <div className="heading-actions">
            <div className="view-tabs" role="tablist" aria-label="Floor area">
              <button role="tab" aria-selected={activeArea === "indoor"} className={activeArea === "indoor" ? "active" : ""} onClick={() => switchArea("indoor")}>Indoor <span>{floorTables.filter((table) => table.area === "indoor").length + barChairs.length}</span></button>
              <div className="area-tab-wrap" role="presentation">
                {activeArea === "indoor" && outdoorReadyCount > 0 && <small className="outdoor-ready-alert" role="status">Outdoor table ready to fly</small>}
                <button role="tab" aria-selected={activeArea === "outdoor"} className={activeArea === "outdoor" ? "active" : activeArea === "indoor" && outdoorReadyCount > 0 ? "outdoor-ready" : ""} onClick={() => switchArea("outdoor")}>Outdoor <span>{floorTables.filter((table) => table.area === "outdoor").length}</span></button>
              </div>
            </div>
            <div className="map-legend" aria-label="Table status legend">
              <span><i className="key greeting" /> Needs to be greeted</span>
              <span><i className="key critical" /> Overdue</span>
              <span><i className="key late" /> Ready to fly</span>
              <span><i className="key plating" /> Serving</span>
              <span><i className="key postflight" /> Post Flight</span>
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
            <div className="editor-intro"><strong>Layout editor</strong><span>Drag tables, chairs, and objects · Smart alignment on</span></div>
            <div className="shape-picker">
              {(["round", "square", "booth"] as Shape[]).map((shape) => <button key={shape} className={addShape === shape ? "active" : ""} onClick={() => setAddShape(shape)}><i className={`shape-icon ${shape}`} />{shape}</button>)}
            </div>
            <button className="add-table" onClick={addTable}>+ Add table</button>
            <button className="rename-table-button" onClick={renameSelectedTable} disabled={!selectedTable}>Rename table</button>
            <button className="delete-table-button" onClick={removeSelectedTable} disabled={!selectedTable}>Delete selected</button>
            <button className="add-chair-button" onClick={addBarChair} disabled={activeArea !== "indoor"}>+ Add chair</button>
            <button className="delete-chair-button" onClick={removeSelectedChair} disabled={selectedChairId === null}>Delete chair</button>
            <div className="object-picker" aria-label="Object type">
              {(["bush", "firepit", "door"] as FloorObjectType[]).map((type) => <button key={type} className={addObjectType === type ? "active" : ""} onClick={() => setAddObjectType(type)}>{type === "firepit" ? "Fire pit" : type}</button>)}
            </div>
            <button className="add-object-button" onClick={addFloorObject}>+ Add object</button>
            <button className="rotate-object-button" onClick={rotateSelectedFloorObject} disabled={!selectedFloorObject}>Rotate object</button>
            <button className="delete-object-button" onClick={removeSelectedFloorObject} disabled={!selectedFloorObject}>Delete object</button>
            <button className="reset-daily" onClick={resetDailyService}>Reset daily totals</button>
            <button className="reset-layout" onClick={resetLayout}>Clear layout</button>
          </div>}

          <div className="floor-scroll">
            <section
              className={`floor-plan ${activeArea}`}
              aria-label={`${activeArea} restaurant floor plan`}
              data-editing={editMode ? "true" : "false"}
              onClick={(event) => {
                if ((event.target as HTMLElement).closest(".floor-table,.bar-chair,.floor-object")) return;
                setSelectedId(0);
                setSelectedChairId(null);
                setSelectedFloorObjectId(null);
              }}
            >
              <div className={`floor-canvas${viewFlipped ? " flipped" : ""}${rotationAnimating ? " animate-rotation" : ""}`} onTransitionEnd={() => setRotationAnimating(false)}>
              {activeArea === "indoor" ? <>
                <div className="bar-fixture"><span>BAR</span></div>
                <div className="pass-fixture"><span>Indoor</span><strong>{areaWaitingCount}</strong><small>waiting</small></div>
                <div className="photo-desk"><span>PHOTO DESK</span></div>
              </> : <>
                <div className="patio-service"><span>Patio</span><strong>{areaWaitingCount}</strong><small>waiting</small></div>
              </>}

              {editMode && snapGuides.x !== null && <div className="snap-guide vertical" style={{ left: `${snapGuides.x}%` }} />}
              {editMode && snapGuides.y !== null && <div className="snap-guide horizontal" style={{ top: `${snapGuides.y}%` }} />}

              {visibleFloorObjects.map((object) => <button
                key={object.id}
                className={`floor-object ${object.type}${selectedFloorObjectId === object.id ? " selected" : ""}`}
                style={{ left: `${object.x}%`, top: `${object.y}%`, transform: `translate(-50%, -50%) rotate(${object.rotation ?? 0}deg) scale(var(--floor-object-scale, 1))` }}
                onClick={(event) => {
                  if (!editMode) return;
                  if (event.currentTarget.dataset.dragged === "true") {
                    event.currentTarget.dataset.dragged = "false";
                    return;
                  }
                  setSelectedFloorObjectId(object.id);
                  setSelectedId(0);
                  setSelectedChairId(null);
                }}
                onPointerDown={(event) => {
                  if (!editMode) return;
                  event.preventDefault();
                  draggingRef.current = true;
                  event.currentTarget.dataset.dragged = "false";
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={(event) => moveFloorObject(event, object.id)}
                onPointerUp={(event) => {
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                  finishMoving("object", object.id);
                }}
                onPointerCancel={() => finishMoving()}
                aria-label={`${object.type === "firepit" ? "Fire pit" : object.type} floor object${editMode ? ", drag to move" : ""}`}
                aria-pressed={selectedFloorObjectId === object.id}
                tabIndex={editMode ? 0 : -1}
                data-editing={editMode ? "true" : "false"}
              >
                {object.type === "bush" && <><span /><span /><span /></>}
                {object.type === "firepit" && Array.from({ length: 8 }, (_, index) => <span key={index} />)}
                {object.type === "door" && <span />}
              </button>)}

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
                    setSelectedFloorObjectId(null);
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
                ><span>{chair.label}</span>{state !== "clear" && <small>{state === "plating" ? "S" : state === "postflight" ? "PF" : state === "late" ? formatTimer(elapsed) : Math.floor(elapsed / 60)}</small>}</button>;
              })}

              {visibleFloorTables.map((table) => {
                const ticket = visibleTickets.find((item) => item.id === table.id);
                const override = statusOverrides[`table:${table.id}`];
                const state = override?.state ?? tableState(ticket, 0);
                const elapsed = override
                  ? Math.max(0, Math.floor(((clock?.getTime() ?? override.startedAt) - override.startedAt) / 1000))
                  : ticket?.elapsedSeconds ?? 0;
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
                      setSelectedFloorObjectId(null);
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
                    {(table.shape === "booth" || table.seats >= 4) && <><span className="chair chair-c" /><span className="chair chair-d" /></>}
                    <span className="table-copy">
                      <span className="table-number">{table.label}</span>
                      <span className="table-time">{override ? state === "late" ? `FLY ${formatTimer(elapsed)}` : shortStatusLabel(state) : ticket ? ticket.status === "plating" ? "SERVING" : formatTimer(ticket.elapsedSeconds) : "CLEAR"}</span>
                    </span>
                  </button>
                );
              })}
              </div>

              <button
                className="rotate-view-button"
                onClick={(event) => { event.stopPropagation(); toggleViewRotation(); }}
                aria-label={viewFlipped ? "Rotate floor view upright" : "Rotate floor view upside down"}
                aria-pressed={viewFlipped}
                title={viewFlipped ? "Rotate view upright" : "Rotate view 180 degrees"}
              >↻</button>

              {selectedObjectKey && (selectedTable || selectedChair) && <section
                className={`selected-panel selection-dialog floor-popover ${(selectedViewX > 58) ? "opens-left" : "opens-right"}`}
                role="dialog"
                aria-label={`Table ${selectedTable?.label ?? selectedChair?.label} details`}
                style={{
                  left: `clamp(200px, calc(${selectedViewX}% + ${(selectedViewX > 58) ? -220 : 220}px), calc(100% - 200px))`,
                  top: `clamp(185px, ${selectedViewY}%, calc(100% - 185px))`,
                }}
                onClick={(event) => event.stopPropagation()}
              >
                <button className="dialog-close" onClick={() => { setSelectedId(0); setSelectedChairId(null); }} aria-label="Close table details">×</button>
                <div className="selected-header">
                  <div><p>Selected table</p><h2>{selectedTable?.label ?? selectedChair?.label ?? "—"}</h2></div>
                  <span className={`status-chip ${selectedState}`}>{statusLabel(selectedState)}{selectedState !== "clear" && ` · ${formatTimer(selectedElapsed)}`}</span>
                </div>
                {!editMode && <div className="status-picker" aria-label="Set table status">
                  <strong>Set status</strong>
                  <div>{statusOptions.map((option) => <button key={option.state} className={`status-option ${option.state}${selectedState === option.state ? " active" : ""}`} onClick={() => setSelectedStatus(option.state)} aria-pressed={selectedState === option.state}><i />{option.label}</button>)}</div>
                </div>}
                {editMode && selectedTable && <div className="table-editor">
                  <label>Table name<input value={selectedTable.label} maxLength={4} onChange={(event) => updateSelectedTable({ label: event.target.value })} /></label>
                  <label>Seats<select value={selectedTable.seats} disabled={selectedTable.shape === "booth"} onChange={(event) => updateSelectedTable({ seats: Number(event.target.value) })}><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="6">6</option><option value="8">8</option></select></label>
                  <label>Shape<select value={selectedTable.shape} onChange={(event) => { const shape = event.target.value as Shape; updateSelectedTable({ shape, ...(shape === "booth" ? { seats: 4 } : {}) }); }}><option value="round">Round</option><option value="square">Square</option><option value="booth">Booth</option></select></label>
                  <label>Area<select value={selectedTable.area} onChange={(event) => { const area = event.target.value as Area; updateSelectedTable({ area }); setActiveArea(area); }}><option value="indoor">Indoor</option><option value="outdoor">Outdoor</option></select></label>
                  <button className="rotate-table-inline" onClick={rotateSelectedTable}>↻ Rotate table 90°</button>
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

      </section>

      {lastServed && <div className="toast" role="status"><span>Table {lastServed.table} served</span><button onClick={undoServed}>Undo</button><button className="toast-close" onClick={() => setLastServed(null)}>×</button></div>}
    </main>
  );
}
