export declare const STRAY_API_URLS: string[];
export declare const CAPABILITIES_HEADER: string;
export declare const REQUIRED_CAPABILITIES: string[];
export declare function checkReleaseBundle(
  bundle: string,
  target: string,
  targets: Record<string, string>
): { ok: boolean; problems: string[] };
