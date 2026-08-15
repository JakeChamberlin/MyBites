export type Shape = "round" | "square" | "booth";
export type Area = "indoor" | "outdoor";
export type ServiceState = "fresh" | "watch" | "late" | "critical" | "plating" | "clear";

export type StatusOverride = {
  state: ServiceState;
  startedAt: number;
};

export type DailyServiceMetrics = {
  dayKey: string;
  customersServed: number;
  completedServices: number;
  totalWaitSeconds: number;
};

export type FloorTable = {
  id: number;
  label: string;
  x: number;
  y: number;
  shape: Shape;
  seats: number;
  area: Area;
  rotation?: number;
};

export type BarChair = {
  id: number;
  label: string;
  x: number;
  y: number;
};

export type SharedFloorState = {
  floorTables: FloorTable[];
  barChairs: BarChair[];
  statusOverrides: Record<string, StatusOverride>;
  dailyService: DailyServiceMetrics;
  version: number;
  updatedAt: number;
};

export type StateOperation =
  | { type: "upsertTable"; table: FloorTable }
  | { type: "deleteTable"; tableId: number }
  | { type: "upsertChair"; chair: BarChair }
  | { type: "deleteChair"; chairId: number }
  | { type: "setStatus"; objectKey: string; status: StatusOverride }
  | { type: "completeService"; objectKey: string; dayKey: string; customers: number }
  | { type: "replaceLayout"; floorTables: FloorTable[]; barChairs: BarChair[] }
  | { type: "clearAll" }
  | { type: "bootstrap"; state: Pick<SharedFloorState, "floorTables" | "barChairs" | "statusOverrides"> };

export const savedFloorTables: FloorTable[] = [
  { id: 1, label: "1", x: 77.5, y: 72.5, shape: "round", seats: 2, area: "indoor", rotation: 90 },
  { id: 2, label: "2", x: 77.5, y: 60, shape: "round", seats: 2, area: "indoor", rotation: 90 },
  { id: 3, label: "3", x: 55, y: 72.5, shape: "round", seats: 2, area: "indoor", rotation: 90 },
  { id: 4, label: "4", x: 55, y: 60, shape: "round", seats: 2, area: "indoor", rotation: 90 },
  { id: 5, label: "5", x: 55, y: 47.5, shape: "round", seats: 2, area: "indoor", rotation: 90 },
  { id: 6, label: "6", x: 32.5, y: 72.5, shape: "round", seats: 2, area: "indoor", rotation: 90 },
  { id: 7, label: "7", x: 32.5, y: 60, shape: "round", seats: 2, area: "indoor", rotation: 90 },
  { id: 8, label: "8", x: 32.5, y: 47.5, shape: "round", seats: 2, area: "indoor", rotation: 90 },
  { id: 9, label: "9", x: 12.5, y: 72.5, shape: "round", seats: 2, area: "indoor", rotation: 90 },
  { id: 10, label: "10", x: 12.5, y: 60, shape: "round", seats: 2, area: "indoor", rotation: 90 },
  { id: 11, label: "11", x: 12.5, y: 47.5, shape: "booth", seats: 6, area: "indoor", rotation: 90 },
];

export const savedBarChairs: BarChair[] = [
  { id: 1, label: "B1", x: 85, y: 82.5 },
  { id: 2, label: "B2", x: 77.5, y: 82.5 },
  { id: 3, label: "B3", x: 70, y: 82.5 },
  { id: 4, label: "B4", x: 62.5, y: 82.5 },
  { id: 5, label: "B5", x: 55, y: 82.5 },
  { id: 6, label: "B6", x: 47.5, y: 82.5 },
  { id: 7, label: "B7", x: 40, y: 82.5 },
  { id: 8, label: "B8", x: 32.5, y: 82.5 },
  { id: 9, label: "B9", x: 25, y: 82.5 },
  { id: 10, label: "B10", x: 17.5, y: 82.5 },
];

export const emptySharedState: SharedFloorState = {
  floorTables: savedFloorTables,
  barChairs: savedBarChairs,
  statusOverrides: {},
  dailyService: { dayKey: "", customersServed: 0, completedServices: 0, totalWaitSeconds: 0 },
  version: 0,
  updatedAt: 0,
};

export function applyStateOperation(state: SharedFloorState, operation: StateOperation): SharedFloorState {
  const next: SharedFloorState = {
    floorTables: state.floorTables.map((table) => ({ ...table })),
    barChairs: state.barChairs.map((chair) => ({ ...chair })),
    statusOverrides: { ...state.statusOverrides },
    dailyService: { ...state.dailyService },
    version: state.version + 1,
    updatedAt: Date.now(),
  };

  switch (operation.type) {
    case "upsertTable": {
      const index = next.floorTables.findIndex((table) => table.id === operation.table.id);
      if (index === -1) next.floorTables.push(operation.table);
      else next.floorTables[index] = operation.table;
      break;
    }
    case "deleteTable":
      next.floorTables = next.floorTables.filter((table) => table.id !== operation.tableId);
      delete next.statusOverrides[`table:${operation.tableId}`];
      break;
    case "upsertChair": {
      const index = next.barChairs.findIndex((chair) => chair.id === operation.chair.id);
      if (index === -1) next.barChairs.push(operation.chair);
      else next.barChairs[index] = operation.chair;
      break;
    }
    case "deleteChair":
      next.barChairs = next.barChairs.filter((chair) => chair.id !== operation.chairId);
      delete next.statusOverrides[`chair:${operation.chairId}`];
      break;
    case "setStatus":
      next.statusOverrides[operation.objectKey] = operation.status;
      break;
    case "completeService": {
      const previousStatus = state.statusOverrides[operation.objectKey];
      if (next.dailyService.dayKey !== operation.dayKey) {
        next.dailyService = { dayKey: operation.dayKey, customersServed: 0, completedServices: 0, totalWaitSeconds: 0 };
      }
      if (previousStatus && previousStatus.state !== "clear") {
        next.dailyService.customersServed += Math.max(1, Math.round(operation.customers));
        next.dailyService.completedServices += 1;
        next.dailyService.totalWaitSeconds += Math.max(0, Math.floor((next.updatedAt - previousStatus.startedAt) / 1000));
      }
      next.statusOverrides[operation.objectKey] = { state: "clear", startedAt: next.updatedAt };
      break;
    }
    case "replaceLayout":
      next.floorTables = operation.floorTables;
      next.barChairs = operation.barChairs;
      break;
    case "clearAll":
      next.floorTables = [];
      next.barChairs = [];
      next.statusOverrides = {};
      break;
    case "bootstrap":
      if (state.version === 0 && state.floorTables.length === 0 && state.barChairs.length === 0) {
        next.floorTables = operation.state.floorTables;
        next.barChairs = operation.state.barChairs;
        next.statusOverrides = operation.state.statusOverrides;
      }
      break;
  }

  return next;
}
