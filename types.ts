export interface ExtractedPage {
  pageNumber: number;
  text: string;
  imageUrl: string; // Base64 of the rendered page
}

export interface AnalysisResult {
  summary: string;
  keywords: string[];
  topics: string[];
  keyPoints: string[];
}

export enum AppStatus {
  IDLE = 'IDLE',
  LOADING_PDF = 'LOADING_PDF',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}

export type ProcessingMode = 'ALL' | 'SINGLE' | 'RANGE';

export interface ProcessingConfig {
  mode: ProcessingMode;
  singlePage: number;
  rangeStart: number;
  rangeEnd: number;
}
