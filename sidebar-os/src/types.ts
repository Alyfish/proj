export type ActionKind = 'summarize' | 'debug' | 'plan' | 'search';

export interface Settings {
  hotkey: string;
  model: string;
  apiBase: string;
  apiKeySet: boolean;
  theme: 'system'|'light'|'dark';
}

export interface ConversationItem {
  id: string;
  action: ActionKind;
  prompt: string;
  response: string;
  createdAt: number;
  tokensIn?: number;
  tokensOut?: number;
}

// Window position storage
export interface WindowPosition {
  x: number;
  y: number;
}

export interface StoredPositions {
  expanded?: WindowPosition;
  sidepanel_right?: WindowPosition;
  sidepanel_left?: WindowPosition;
}

