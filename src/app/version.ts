import { dataMeta } from '../data';

export const appVersion: string = __APP_VERSION__;

/** Data version as shown in the footer, e.g. `Data: ccRO 2026-11 (488169a3) · rAthena 7f080871`. */
export const dataVersion = `Data: ${dataMeta.label} (${dataMeta.hash}) · rAthena ${dataMeta.rathenaCommit.slice(0, 8)}`;
