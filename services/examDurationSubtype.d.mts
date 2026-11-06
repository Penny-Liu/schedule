export function getUsDurationSubtype(name: string): string | null;
export const US_DURATION_WEIGHTS: Readonly<Record<string,number>>;
export function getUsDurationWeight(name:string):number|null;
export function getUsDurationAllocation<T extends {CheckupName__c?:string}>(items:T[]):{items:{item:T;weight:number|null}[];totalWeight:number;unsupported:boolean};
