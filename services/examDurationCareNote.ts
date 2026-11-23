export function formatDurationCareNote(row:{category:string;fieldKey:string;claustrophobiaCount?:number|null;careNotesComplete?:boolean}) {
 if(row.category!=='MR'||row.fieldKey==='mrPostProcessing')return '';
 if((row.claustrophobiaCount||0)>0)return `幽閉：${row.claustrophobiaCount}例${row.careNotesComplete?'':'（部分資料）'}`;
 return row.careNotesComplete?'':'關懷註記待同步';
}

export const durationCareNoteClass=(row:{claustrophobiaCount?:number|null})=>(row.claustrophobiaCount||0)>0?'text-red-700 font-semibold':'text-slate-500';
