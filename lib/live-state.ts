export type Shape = "round" | "square" | "booth";
export type Area = "indoor" | "outdoor";
export type FloorObjectType = "bush" | "firepit" | "door";
export type ServiceState = "fresh" | "watch" | "late" | "critical" | "plating" | "postflight" | "clear";

export type StatusOverride = {
  state: ServiceState;
  startedAt: number;
  serviceStartedAt?: number;
  categoryStartedAt?: number;
};

export type DailyServiceMetrics = {
  dayKey: string;
  customersServed: number;
  completedServices: number;
  totalWaitSeconds: number;
  greetingServingSeconds: number;
  greetingServingSamples: number;
  readyToFlySeconds: number;
  readyToFlySamples: number;
  postFlightSeconds: number;
  postFlightSamples: number;
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

export type FloorObject = {
  id: number;
  type: FloorObjectType;
  x: number;
  y: number;
  area: Area;
  rotation?: number;
};

export type SharedFloorState = {
  floorTables: FloorTable[];
  barChairs: BarChair[];
  floorObjects: FloorObject[];
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
  | { type: "upsertObject"; object: FloorObject }
  | { type: "deleteObject"; objectId: number }
  | { type: "setStatus"; objectKey: string; dayKey: string; status: StatusOverride }
  | { type: "completeService"; objectKey: string; dayKey: string; customers: number }
  | { type: "resetDailyService"; dayKey: string }
  | { type: "replaceLayout"; floorTables: FloorTable[]; barChairs: BarChair[] }
  | { type: "clearAll" }
  | { type: "bootstrap"; state: Pick<SharedFloorState, "floorTables" | "barChairs" | "statusOverrides"> };

export const savedFloorTables: FloorTable[] = [
  { id: 1, label: "101", x: 77.5, y: 72.5, shape: "square", seats: 2, area: "indoor", rotation: 180 },
  { id: 2, label: "201", x: 77.5, y: 55, shape: "square", seats: 2, area: "indoor", rotation: 180 },
  { id: 3, label: "102", x: 55, y: 72.5, shape: "square", seats: 2, area: "indoor", rotation: 180 },
  { id: 4, label: "202", x: 55, y: 55, shape: "square", seats: 2, area: "indoor", rotation: 180 },
  { id: 5, label: "301", x: 55, y: 35, shape: "square", seats: 2, area: "indoor", rotation: 180 },
  { id: 6, label: "103", x: 32.5, y: 72.5, shape: "square", seats: 2, area: "indoor", rotation: 180 },
  { id: 7, label: "203", x: 32.5, y: 55, shape: "square", seats: 2, area: "indoor", rotation: 180 },
  { id: 8, label: "302", x: 32.5, y: 35, shape: "square", seats: 2, area: "indoor", rotation: 180 },
  { id: 9, label: "104", x: 12.5, y: 72.5, shape: "square", seats: 2, area: "indoor", rotation: 90 },
  { id: 10, label: "204", x: 12.5, y: 55, shape: "square", seats: 2, area: "indoor", rotation: 90 },
  { id: 11, label: "303", x: 12.5, y: 35, shape: "booth", seats: 4, area: "indoor", rotation: 90 },
  { id: 12, label: "12", x: 12.5, y: 67.5, shape: "square", seats: 2, area: "outdoor", rotation: 90 },
  { id: 13, label: "13", x: 7.5, y: 57.5, shape: "square", seats: 2, area: "outdoor", rotation: 90 },
  { id: 14, label: "14", x: 17.5, y: 57.5, shape: "square", seats: 2, area: "outdoor", rotation: 270 },
  { id: 15, label: "15", x: 12.5, y: 47.5, shape: "square", seats: 2, area: "outdoor", rotation: 90 },
  { id: 16, label: "16", x: 45, y: 57.5, shape: "square", seats: 2, area: "outdoor", rotation: 90 },
  { id: 17, label: "17", x: 35, y: 45, shape: "square", seats: 2, area: "outdoor", rotation: 90 },
  { id: 18, label: "18", x: 47.5, y: 75, shape: "square", seats: 2, area: "outdoor", rotation: 90 },
  { id: 19, label: "19", x: 75, y: 37.5, shape: "square", seats: 2, area: "outdoor", rotation: 90 },
  { id: 20, label: "20", x: 67.5, y: 67.5, shape: "square", seats: 2, area: "outdoor", rotation: 90 },
  { id: 21, label: "21", x: 87.5, y: 50, shape: "square", seats: 2, area: "outdoor", rotation: 90 },
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

export const savedFloorObjects: FloorObject[] = [
  { id: 1, type: "bush", x: 5, y: 90, area: "outdoor", rotation: 0 },
  { id: 2, type: "bush", x: 12.5, y: 90, area: "outdoor", rotation: 0 },
  { id: 3, type: "bush", x: 20, y: 90, area: "outdoor", rotation: 0 },
  { id: 4, type: "bush", x: 27.5, y: 90, area: "outdoor", rotation: 0 },
  { id: 5, type: "bush", x: 35, y: 90, area: "outdoor", rotation: 0 },
  { id: 6, type: "firepit", x: 30, y: 57.5, area: "outdoor", rotation: 0 },
  { id: 7, type: "firepit", x: 72.5, y: 50, area: "outdoor", rotation: 0 },
  { id: 8, type: "bush", x: 42.5, y: 90, area: "outdoor", rotation: 0 },
  { id: 9, type: "bush", x: 50, y: 90, area: "outdoor", rotation: 0 },
  { id: 10, type: "bush", x: 57.5, y: 90, area: "outdoor", rotation: 0 },
  { id: 11, type: "bush", x: 65, y: 90, area: "outdoor", rotation: 0 },
  { id: 12, type: "bush", x: 72.5, y: 90, area: "outdoor", rotation: 0 },
  { id: 13, type: "bush", x: 80, y: 90, area: "outdoor", rotation: 0 },
  { id: 14, type: "bush", x: 87.5, y: 90, area: "outdoor", rotation: 0 },
  { id: 15, type: "bush", x: 95, y: 90, area: "outdoor", rotation: 0 },
  { id: 16, type: "bush", x: 95, y: 80, area: "outdoor", rotation: 0 },
  { id: 17, type: "bush", x: 95, y: 70, area: "outdoor", rotation: 0 },
  { id: 18, type: "bush", x: 95, y: 60, area: "outdoor", rotation: 0 },
  { id: 19, type: "bush", x: 95, y: 50, area: "outdoor", rotation: 0 },
  { id: 20, type: "bush", x: 95, y: 40, area: "outdoor", rotation: 0 },
  { id: 21, type: "bush", x: 95, y: 30, area: "outdoor", rotation: 0 },
  { id: 22, type: "bush", x: 95, y: 20, area: "outdoor", rotation: 0 },
];

function createDailyServiceMetrics(dayKey = ""): DailyServiceMetrics {
  return {
    dayKey,
    customersServed: 0,
    completedServices: 0,
    totalWaitSeconds: 0,
    greetingServingSeconds: 0,
    greetingServingSamples: 0,
    readyToFlySeconds: 0,
    readyToFlySamples: 0,
    postFlightSeconds: 0,
    postFlightSamples: 0,
  };
}

function waitCategory(state: ServiceState) {
  if (state === "late" || state === "critical") return "ready";
  if (state === "fresh" || state === "watch" || state === "plating") return "service";
  if (state === "postflight") return "postflight";
  return null;
}

function recordCategoryWait(metrics: DailyServiceMetrics, status: StatusOverride, endedAt: number) {
  const seconds = Math.max(0, Math.floor((endedAt - (status.categoryStartedAt ?? status.startedAt)) / 1000));
  const category = waitCategory(status.state);
  if (category === "ready") {
    metrics.readyToFlySeconds += seconds;
    metrics.readyToFlySamples += 1;
  }
  if (category === "service") {
    metrics.greetingServingSeconds += seconds;
    metrics.greetingServingSamples += 1;
  }
  if (category === "postflight") {
    metrics.postFlightSeconds += seconds;
    metrics.postFlightSamples += 1;
  }
}

export const emptySharedState: SharedFloorState = {
  floorTables: savedFloorTables,
  barChairs: savedBarChairs,
  floorObjects: savedFloorObjects,
  statusOverrides: {},
  dailyService: createDailyServiceMetrics(),
  version: 0,
  updatedAt: 0,
};

export function applyStateOperation(state: SharedFloorState, operation: StateOperation): SharedFloorState {
  const next: SharedFloorState = {
    floorTables: state.floorTables.map((table) => ({ ...table })),
    barChairs: state.barChairs.map((chair) => ({ ...chair })),
    floorObjects: state.floorObjects.map((object) => ({ ...object })),
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
    case "upsertObject": {
      const index = next.floorObjects.findIndex((object) => object.id === operation.object.id);
      if (index === -1) next.floorObjects.push(operation.object);
      else next.floorObjects[index] = operation.object;
      break;
    }
    case "deleteObject":
      next.floorObjects = next.floorObjects.filter((object) => object.id !== operation.objectId);
      break;
    case "setStatus": {
      if (next.dailyService.dayKey !== operation.dayKey) next.dailyService = createDailyServiceMetrics(operation.dayKey);
      const previousStatus = state.statusOverrides[operation.objectKey];
      const previousCategory = previousStatus ? waitCategory(previousStatus.state) : null;
      const nextCategory = waitCategory(operation.status.state);
      if (previousStatus && previousCategory && previousCategory !== nextCategory) recordCategoryWait(next.dailyService, previousStatus, next.updatedAt);
      next.statusOverrides[operation.objectKey] = {
        ...operation.status,
        categoryStartedAt: previousStatus && previousCategory === nextCategory
          ? previousStatus.categoryStartedAt ?? previousStatus.startedAt
          : operation.status.categoryStartedAt ?? operation.status.startedAt,
      };
      break;
    }
    case "completeService": {
      const previousStatus = state.statusOverrides[operation.objectKey];
      if (next.dailyService.dayKey !== operation.dayKey) {
        next.dailyService = createDailyServiceMetrics(operation.dayKey);
      }
      if (previousStatus && previousStatus.state !== "clear") {
        recordCategoryWait(next.dailyService, previousStatus, next.updatedAt);
        next.dailyService.customersServed += Math.max(1, Math.round(operation.customers));
        next.dailyService.completedServices += 1;
        next.dailyService.totalWaitSeconds += Math.max(0, Math.floor((next.updatedAt - (previousStatus.serviceStartedAt ?? previousStatus.startedAt)) / 1000));
      }
      next.statusOverrides[operation.objectKey] = { state: "clear", startedAt: next.updatedAt, categoryStartedAt: next.updatedAt };
      break;
    }
    case "resetDailyService":
      next.dailyService = createDailyServiceMetrics(operation.dayKey);
      break;
    case "replaceLayout":
      next.floorTables = operation.floorTables;
      next.barChairs = operation.barChairs;
      break;
    case "clearAll":
      next.floorTables = [];
      next.barChairs = [];
      next.floorObjects = [];
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
