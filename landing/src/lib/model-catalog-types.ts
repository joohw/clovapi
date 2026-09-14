export type ModelActivity = { date: string; requests: number };

export type ModelCatalogUsage = {
  id: string;
  requests24h: number;
  requests7d: number;
  activity: ModelActivity[];
};

export type CatalogModel = ModelCatalogUsage & { availableNodes: number };

export type ModelCatalog = {
  object: "model_catalog";
  updatedAt: string;
  usageUpdatedAt: string;
  historySince: string;
  refreshAfterSeconds: number;
  stale: boolean;
  models: CatalogModel[];
  totals: {
    models: number;
    nodes: number;
    requests24h: number;
    requests7d: number;
  };
};
