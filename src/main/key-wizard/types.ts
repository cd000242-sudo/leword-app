// LEWORD Key Wizard — 공용 타입 정의
// 작성: 2026-04-15

export type KeyWizardSite =
  | 'youtube'
  | 'threads'
  | 'naver-dev'
  | 'naver-searchad'
  | 'rakuten'
  | 'bigkinds';

export type KeyWizardStrategy = 'oauth-loopback' | 'clipboard-watch' | 'deep-link-only';

export interface UserGuideStep {
  title: string;
  description: string;
  externalUrl?: string;
  inputs?: Array<{ key: string; label: string; placeholder?: string; secret?: boolean }>;
}

export interface ProviderDefinition {
  site: KeyWizardSite;
  displayName: string;
  icon: string;
  strategy: KeyWizardStrategy;
  preSteps?: UserGuideStep[];
  description: string;
}

export interface KeyWizardProgressEvent {
  site: KeyWizardSite;
  step: string;
  message: string;
  level: 'info' | 'success' | 'warn' | 'error';
  detected?: Record<string, boolean>;
}

export interface KeyWizardResult {
  success: boolean;
  site: KeyWizardSite;
  keys?: Record<string, string>;
  reason?: string;
  errorCode?: string;
  partial?: boolean;
}

export interface ClipboardPattern {
  name: string;
  regex: RegExp;
  required: boolean;
  label: string;
}

export class KeyWizardError extends Error {
  constructor(
    public code: string,
    message: string,
    public site?: KeyWizardSite
  ) {
    super(message);
    this.name = 'KeyWizardError';
  }
}
