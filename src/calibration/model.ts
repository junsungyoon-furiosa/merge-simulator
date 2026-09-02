import type { EnvironmentParameterId, EnvironmentParameterValueMap } from "../sim/model";

export type DocumentationStatus = "notStarted" | "draft" | "complete";
export type EstimateState<T> =
  | { status: "none" }
  | { status: "provisional" | "recommended"; value: T };

export interface EvidenceSource {
  label: string;
  url?: string;
}

export interface ParameterEvidence<T> {
  documentationStatus: DocumentationStatus;
  estimate: EstimateState<T>;
  realityMeaning: string;
  simulationMeaning: string;
  method: string[];
  dataBasis: {
    source?: string;
    observationPeriod?: string;
    sampleSize?: number;
    updatedAt?: string;
  };
  limitations: string[];
  detailMarkdown: string;
  sources?: EvidenceSource[];
}

export type ParameterEvidenceMap = {
  [K in EnvironmentParameterId]: ParameterEvidence<EnvironmentParameterValueMap[K]>;
};

export interface CalibrationProfile {
  id: string;
  name: string;
  version: number;
  description: string;
  parameters: ParameterEvidenceMap;
}
