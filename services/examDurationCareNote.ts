export function formatDurationCareNote(row:{category:string;fieldKey:string;claustrophobiaCount?:number|null;careNotesComplete?:boolean}) {
 if(row.category!=='MR'||row.fieldKey==='mrPostProcessing')return '';
 if((row.claustrophobiaCount||0)>0)return `關懷：幽閉 ${row.claustrophobiaCount} 次${row.careNotesComplete?'':'（部分資料）'}`;
 return row.careNotesComplete?'':'關懷註記待同步';
}
