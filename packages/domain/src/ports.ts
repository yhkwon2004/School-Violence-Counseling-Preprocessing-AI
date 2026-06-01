import type {
  CaseRecord,
  EvidenceAsset,
  FactBlock,
  MissingInfoQuestion,
  ProcessingJob,
  Profile,
} from './models';

export type AnalysisInput = {
  caseId: string;
  memo: string;
  evidence: EvidenceAsset[];
  synthetic: boolean;
};

export type AnalysisResult = {
  factBlocks: FactBlock[];
  questions: MissingInfoQuestion[];
  summary: string;
  usedExternalAi: boolean;
};

export interface Analyzer {
  analyze(input: AnalysisInput): Promise<AnalysisResult>;
}
export interface CaseRepository {
  getById(caseId: string): Promise<CaseRecord | null>;
  listForCounselor(counselorId: string): Promise<CaseRecord[]>;
  save(caseRecord: CaseRecord): Promise<void>;
  claim(caseId: string, counselorId: string): Promise<boolean>;
}

export interface EvidenceRepository {
  listByCase(caseId: string): Promise<EvidenceAsset[]>;
  createSignedUploadUrl(caseId: string, fileName: string): Promise<string>;
  createSignedDownloadUrl(evidenceId: string): Promise<string>;
  queueProcessing(evidenceId: string): Promise<ProcessingJob>;
}

export type DraftSnapshot = {
  memo: string;
  step: number;
  updatedAt: string;
};

export interface DraftStore {
  read(caseId: string): Promise<DraftSnapshot | null>;
  write(caseId: string, draft: DraftSnapshot): Promise<void>;
  clear(caseId: string): Promise<void>;
}

export interface IdentityGateway {
  studentLogin(loginId: string, password: string): Promise<Profile>;
  staffLogin(email: string, password: string): Promise<Profile>;
}
