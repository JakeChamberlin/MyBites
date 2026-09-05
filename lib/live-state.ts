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

export type YearlyServiceMetrics = {
  yearKey: string;
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
  yearlyService: YearlyServiceMetrics;
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
  { id: 1788626546577253, label: "P1", x: 60, y: 20, shape: "square", seats: 4, area: "outdoor", rotation: 0 },
  { id: 1788626555460447, label: "P2", x: 22.5, y: 20, shape: "square", seats: 4, area: "outdoor", rotation: 0 },
  { id: 1788626566701800, label: "P3", x: 40, y: 30, shape: "square", seats: 4, area: "outdoor", rotation: 0 },
  { id: 1788626572285110, label: "P4", x: 22.5, y: 40, shape: "square", seats: 4, area: "outdoor", rotation: 0 },
  { id: 1788626737976753, label: "P5", x: 52.5, y: 42.5, shape: "square", seats: 4, area: "outdoor", rotation: 0 },
  { id: 1788626746002482, label: "P6", x: 22.5, y: 57.5, shape: "square", seats: 4, area: "outdoor", rotation: 0 },
  { id: 1788626752102023, label: "P7", x: 55, y: 57.5, shape: "square", seats: 4, area: "outdoor", rotation: 0 },
  { id: 1788626762677170, label: "P9", x: 27.5, y: 85, shape: "square", seats: 4, area: "outdoor", rotation: 0 },
  { id: 1788626770827989, label: "P10", x: 62.5, y: 85, shape: "square", seats: 4, area: "outdoor", rotation: 0 },
  { id: 1788627001827859, label: "P8", x: 45, y: 67.5, shape: "square", seats: 4, area: "outdoor", rotation: 0 },
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
  { id: 1788626398127564, type: "bush", x: 92.5, y: 5, area: "outdoor", rotation: 0 },
  { id: 1788626411561153, type: "bush", x: 82.5, y: 5, area: "outdoor", rotation: 0 },
  { id: 1788626414619291, type: "bush", x: 72.5, y: 5, area: "outdoor", rotation: 0 },
  { id: 1788626417252379, type: "bush", x: 62.5, y: 5, area: "outdoor", rotation: 0 },
  { id: 1788626419586001, type: "bush", x: 52.5, y: 5, area: "outdoor", rotation: 0 },
  { id: 1788626422652979, type: "bush", x: 42.5, y: 5, area: "outdoor", rotation: 0 },
  { id: 1788626425952172, type: "bush", x: 7.5, y: 20, area: "outdoor", rotation: 0 },
  { id: 1788626431686037, type: "bush", x: 7.5, y: 27.5, area: "outdoor", rotation: 0 },
  { id: 1788626435569355, type: "bush", x: 7.5, y: 35, area: "outdoor", rotation: 0 },
  { id: 1788626439477767, type: "bush", x: 7.5, y: 42.5, area: "outdoor", rotation: 0 },
  { id: 1788626441760762, type: "bush", x: 7.5, y: 50, area: "outdoor", rotation: 0 },
  { id: 1788626444211737, type: "bush", x: 7.5, y: 57.5, area: "outdoor", rotation: 0 },
  { id: 1788626446360366, type: "bush", x: 7.5, y: 87.5, area: "outdoor", rotation: 0 },
  { id: 1788626446510529, type: "bush", x: 7.5, y: 80, area: "outdoor", rotation: 0 },
  { id: 1788626446669167, type: "bush", x: 7.5, y: 72.5, area: "outdoor", rotation: 0 },
  { id: 1788626446835465, type: "bush", x: 7.5, y: 65, area: "outdoor", rotation: 0 },
  { id: 1788626456735883, type: "bush", x: 7.5, y: 95, area: "outdoor", rotation: 0 },
  { id: 1788626462777790, type: "bush", x: 20, y: 95, area: "outdoor", rotation: 0 },
  { id: 1788626465660561, type: "bush", x: 32.5, y: 95, area: "outdoor", rotation: 0 },
  { id: 1788626469319171, type: "bush", x: 45, y: 95, area: "outdoor", rotation: 0 },
  { id: 1788626484752909, type: "bush", x: 57.5, y: 95, area: "outdoor", rotation: 0 },
  { id: 1788626489702272, type: "bush", x: 70, y: 95, area: "outdoor", rotation: 0 },
  { id: 1788626521443313, type: "bush", x: 85, y: 95, area: "outdoor", rotation: 0 },
  { id: 1788626530343723, type: "firepit", x: 37.5, y: 47.5, area: "outdoor", rotation: 90 },
  { id: 1788626537518296, type: "firepit", x: 45, y: 82.5, area: "outdoor", rotation: 90 },
  { id: 1788627113548616, type: "door", x: 97.5, y: 15, area: "outdoor", rotation: 90 },
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

function createYearlyServiceMetrics(yearKey = ""): YearlyServiceMetrics {
  return {
    yearKey,
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

function recordCategoryWait(metrics: DailyServiceMetrics | YearlyServiceMetrics, status: StatusOverride, endedAt: number) {
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
  yearlyService: createYearlyServiceMetrics(),
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
    yearlyService: { ...state.yearlyService },
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
      const yearKey = operation.dayKey.slice(0, 4);
      if (next.yearlyService.yearKey !== yearKey) next.yearlyService = createYearlyServiceMetrics(yearKey);
      const previousStatus = state.statusOverrides[operation.objectKey];
      const previousCategory = previousStatus ? waitCategory(previousStatus.state) : null;
      const nextCategory = waitCategory(operation.status.state);
      if (previousStatus && previousCategory && previousCategory !== nextCategory) {
        recordCategoryWait(next.dailyService, previousStatus, next.updatedAt);
        recordCategoryWait(next.yearlyService, previousStatus, next.updatedAt);
      }
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
      const yearKey = operation.dayKey.slice(0, 4);
      if (next.yearlyService.yearKey !== yearKey) next.yearlyService = createYearlyServiceMetrics(yearKey);
      if (previousStatus && previousStatus.state !== "clear") {
        recordCategoryWait(next.dailyService, previousStatus, next.updatedAt);
        recordCategoryWait(next.yearlyService, previousStatus, next.updatedAt);
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
