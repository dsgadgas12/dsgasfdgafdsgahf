/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly VITE_API_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface TelegramWebAppUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
}
interface TelegramWebApp {
  initData: string;
  initDataUnsafe?: { user?: TelegramWebAppUser; start_param?: string };
  ready(): void;
  expand(): void;
  openTelegramLink?(url: string): void;
  openLink?(url: string): void;
  openInvoice?(url: string, callback?: (status: string) => void): void;
  shareMessage?(messageId: string, callback?: (sent: boolean) => void): void;
  isVersionAtLeast?(version: string): boolean;
  HapticFeedback?: { impactOccurred(style: "light"|"medium"|"heavy"): void; notificationOccurred(style: "error"|"success"|"warning"): void };
  BackButton?: { show(): void; hide(): void; onClick(fn:()=>void): void; offClick(fn:()=>void): void };
}
interface Window { Telegram?: { WebApp?: TelegramWebApp }; }
